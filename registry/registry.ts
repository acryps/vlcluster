import { Crypto } from "../crypto";
import { Cluster } from "../cluster";

import * as fs from "fs";
import * as path from "path";
import { worker } from "cluster";

export class RegistryServer {
	key: string;

	runningWorkers: {
		name: string,
		lastSeen: Date,
		cpuUsage: number,
		up: boolean
	}[];

	proposedInstalls: {
		application: string,
		version: string,
		env: string,
		worker: string,
		installing: boolean,
		requested: boolean,
		key: string
	}[];

	constructor() {
		if (!RegistryServer.isInstalled()) {
			throw new Error("No registry installed on this host!");
		}

		this.key = fs.readFileSync(RegistryServer.keyFile).toString();

		this.runningWorkers = [];
		this.proposedInstalls = [];
	}

	createWorker(name: string) {
		console.log(`[ registry ]\tcreating worker '${name}'`);

		if (fs.existsSync(RegistryServer.workerDirectory(name))) {
			throw new Error("worker already registered");
		}

		const key = Crypto.createKey();

		// create worker directory
		fs.mkdirSync(RegistryServer.workerDirectory(name));
		fs.writeFileSync(RegistryServer.workerKeyFile(name), key);

		console.log(`[ registry ]\tcreated worker '${name}'`);

		return key;
	}

	createClient(name: string) {
		const key = Crypto.createKey();

		if (fs.existsSync(RegistryServer.clientDirectory(name))) {
			throw new Error(`client '${name}' already exists!`);
		}

		console.log(`[ registry ]\tcreating client ${name}`);

		fs.mkdirSync(RegistryServer.clientDirectory(name));
		fs.writeFileSync(RegistryServer.clientKeyFile(name), key);

		console.log(`[ registry ]\tcreated client`);

		return key;
	}

	static isInstalled() {
		return fs.existsSync(RegistryServer.rootDirectory);
	}

	static async create(name: string) {
		// generate key
		const key = Crypto.createKey();

		// create registry directory
		fs.mkdirSync(RegistryServer.rootDirectory);

		// create files
		fs.writeFileSync(RegistryServer.keyFile, key);
		fs.writeFileSync(RegistryServer.nameFile, name);

		// create registry
		fs.mkdirSync(RegistryServer.workersDirectory);
		fs.mkdirSync(RegistryServer.clientsDirectory);
		fs.mkdirSync(RegistryServer.applicationsDirectory);

		return key;
	}

	static get rootDirectory() {
		return path.join(Cluster.localDirectory, "registry");
	}

	static get keyFile() {
		return path.join(this.rootDirectory, "key");
	}

	static get nameFile() {
		return path.join(this.rootDirectory, "name");
	}

	static get applicationsDirectory() {
		return path.join(this.rootDirectory, "applications");
	}

	static applicationDirectory(name: string) {
		return path.join(this.applicationsDirectory, Crypto.sanitizeApplicationName(name));
	}

	static applicationVersionsDirectory(name: string) {
		return path.join(this.applicationDirectory(name), "versions");
	}

	static applicationEnvironnementsDirectory(name: string) {
		return path.join(this.applicationDirectory(name), "environnements");
	}

	static applicationVersionDirectory(name: string, version: string) {
		return path.join(this.applicationVersionsDirectory(name), Crypto.sanitizeVersion(version));
	}

	static applicationVersionImageSourceFile(name: string, version: string) {
		return path.join(this.applicationVersionDirectory(name, version), "source");
	}

	static applicationVersionImageKeyFile(name: string, version: string) {
		return path.join(this.applicationVersionDirectory(name, version), "key");
	}

	static applicationVersionImageIdFile(name: string, version: string) {
		return path.join(this.applicationVersionDirectory(name, version), "id");
	}

	static get workersDirectory() {
		return path.join(this.rootDirectory, "workers");
	}

	static workerDirectory(name: string) {
		return path.join(this.workersDirectory, Crypto.sanitizeWorkerName(name));
	}

	static workerKeyFile(name: string) {
		return path.join(this.workerDirectory(name), "key");
	}

	static get clientsDirectory() {
		return path.join(this.rootDirectory, "clients");
	}

	static clientDirectory(name: string) {
		return path.join(this.clientsDirectory, Crypto.sanitizeUsername(name));
	}

	static clientKeyFile(name: string) {
		return path.join(this.clientDirectory(name), "key");
	}

	get name() {
		return fs.readFileSync(RegistryServer.nameFile).toString();
	}

	register(app) {
		app.post(Cluster.api.registry.createWorker, (req, res) => {
			if (this.key != req.body.key) {
				throw new Error(`[ registry ]\tinvalid key login attepted`);
			}

			const key = this.createWorker(req.body.name);

			res.json({
				key: key,
				name: this.name
			});
		});

		app.post(Cluster.api.registry.createClient, (req, res) => {
			if (this.key != req.body.key) {
				throw new Error(`[ registry ]\tinvalid key login attepted`);
			}

			const key = this.createClient(req.body.username);

			res.json({
				key,
				name: this.name
			});
		});

		app.post(Cluster.api.registry.createImage, (req, res) => {
			const key = fs.readFileSync(RegistryServer.clientKeyFile(req.body.username));
			
			if (key != req.body.key) {
				throw new Error(`invalid key login attepted`);
			}

			const version = req.body.version;
			const application = req.body.name;

			if (!application) {
				throw new Error(`no application name set`);
			}

			if (!version) {
				throw new Error(`no version set`);
			}

			console.log(`[ registry ]\tcreate '${application}' v${version}`);

			if (!fs.existsSync(RegistryServer.applicationDirectory(application))) {
				console.log(`[ registry ]\tcreate new application '${application}'`);

				fs.mkdirSync(RegistryServer.applicationDirectory(application));
				fs.mkdirSync(RegistryServer.applicationVersionsDirectory(application));
				fs.mkdirSync(RegistryServer.applicationEnvironnementsDirectory(application));
			}

			if (fs.existsSync(RegistryServer.applicationVersionDirectory(application, version))) {
				throw new Error(`version '${version}' of application '${application}' already exists!`);
			}

			fs.mkdirSync(RegistryServer.applicationVersionDirectory(application, version));

			const uploadKey = Crypto.createKey();
			fs.writeFileSync(RegistryServer.applicationVersionImageKeyFile(application, version), uploadKey);

			res.json({
				key: uploadKey
			});
		});

		app.post(Cluster.api.registry.uploadImage, (req, res) => {
			const application = req.headers["cluster-application"];
			const version = req.headers["cluster-version"];
			const key = req.headers["cluster-key"];
			const id = req.headers["cluster-image-id"];

			if (!fs.existsSync(RegistryServer.applicationVersionDirectory(application, version))) {
				throw new Error("version does not exists!")
			}

			if (fs.readFileSync(RegistryServer.applicationVersionImageKeyFile(application, version)).toString() != key) {
				throw new Error("invalid upload key set");
			}

			fs.writeFileSync(RegistryServer.applicationVersionImageIdFile(application, version), id);

			console.log(`[ registry ]\tuploading image v${version}`);
			req.pipe(fs.createWriteStream(RegistryServer.applicationVersionImageSourceFile(application, version)));

			req.on("end", () => {
				console.log(`[ registry ]\tuploaded image v${version}`);

				res.json({
					size: fs.lstatSync(
						RegistryServer.applicationVersionImageSourceFile(application, version)
					).size
				})
			})
		});

		app.post(Cluster.api.registry.upgrade, async (req, res) => {
			await this.validateClientAuth(req);

			const env = req.headers["cluster-env"];
			const application = req.headers["cluster-application"];
			const version = req.headers["cluster-version"];

			if (!fs.existsSync(RegistryServer.applicationVersionDirectory(application, version))) {
				throw new Error("application or version does not exist!");
			}

			console.log(`[ registry ]\tupgrading '${application}' to v${version}`);
			await this.proposeInstall(application, version, env);

			res.json();
		});

		app.post(Cluster.api.registry.ping, (req, res) => {
			const name = req.body.name;
			const key = req.body.key;
			const cpuUsage = req.body.cpuUsage;

			const installRequests = [];

			if (!name) {
				throw new Error("no name!");
			}

			if (key != fs.readFileSync(RegistryServer.workerKeyFile(name)).toString()) {
				throw new Error("invalid key!");
			}

			let worker = this.runningWorkers.find(s => s.name == name);
			const now = new Date();

			if (!worker) {
				worker = {
					name,
					cpuUsage,
					lastSeen: now,
					up: true
				};

				this.runningWorkers.push(worker);
				console.log(`[ cluster ]\tworker login '${name}'`);
			} else {
				worker.cpuUsage = cpuUsage;
				worker.lastSeen = now;
				worker.up = true;
			}

			for (let proposal of this.proposedInstalls) {
				if (!proposal.installing && proposal.worker == worker.name) {
					console.log(`[ cluster ]\tsent proposal '${proposal.application}' v${proposal.version} for env '${proposal.env}' to '${worker.name}'`);

					installRequests.push({
						application: proposal.application,
						version: proposal.version,
						env: proposal.env,
						key: proposal.key,
						imageId: fs.readFileSync(RegistryServer.applicationVersionImageIdFile(proposal.application, proposal.version)).toString()
					});

					proposal.requested = true;

					setTimeout(() => {
						if (proposal.requested && !proposal.installing) {
							console.warn(`[ cluster ]\tinstall request for proposal '${proposal.application}' for worker '${worker.name}' timed out`);

							// remvoe failed install request
							this.proposedInstalls.splice(this.proposedInstalls.indexOf(proposal), 1);

							// create new proposal 
							this.proposeInstall(proposal.application, proposal.version, proposal.env);
						}
					}, Cluster.imageInstallRequestTimeout);
				}
			}

			setTimeout(() => {
				if (worker.lastSeen == now) {
					console.warn(`[ cluster ]\tworker ${name} ping timeout!`);

					worker.up = false;

					for (let proposal of this.proposedInstalls) {
						if (!proposal.installing && proposal.worker == worker.name) {
							console.warn(`[ cluster ]\tproposal for '${proposal.application}' for worker '${worker.name}' timed out`);

							// remvoe failed proposal
							this.proposedInstalls.splice(this.proposedInstalls.indexOf(proposal), 1);

							// create new proposal 
							this.proposeInstall(proposal.application, proposal.version, proposal.env);
						}
					}
				}
			}, Cluster.pingTimeout);

			res.json({
				installRequests
			});
		});

		app.post(Cluster.api.registry.install, (req, res) => {
			const key = req.headers["cluster-key"];
			
			const request = this.proposedInstalls.find(s => s.key == key);

			if (!request) {
				throw new Error("no install found!");
			}

			request.installing = true;
			
			console.warn(`[ cluster ]\tsending '${request.application}' v${request.version} image to '${request.worker}'`);
			fs.createReadStream(RegistryServer.applicationVersionImageSourceFile(request.application, request.version)).pipe(res);
		});

		setInterval(() => {
			process.stdout.write(`\u001b[2m[ cluster ]\t${this.runningWorkers.length ? this.runningWorkers.map(
				w => `${w.up ? "\u001b[2m✔" : "\u001b[31m✗"} ${w.name}: ${w.cpuUsage.toFixed(1).padStart(5, " ")}%\u001b[0m`
			).join("\u001b[2m, \u001b[0m") : "no running workers"}\u001b[0m\n`);
		}, Cluster.pingInterval);
	}

	proposeInstall(application: string, version: string, env: string) {
		return new Promise(done => {
			const worker = this.runningWorkers.filter(w => w.up).sort((a, b) => a.cpuUsage - b.cpuUsage)[0];

			if (!worker) {
				console.warn(`[ cluster ]\tout of workers to run '${application}' v${version} for env '${env}'. retrying in ${Math.round(Cluster.pingInterval / 1000)}s`);

				setTimeout(async () => {
					done(await this.proposeInstall(application, version, env));
				}, Cluster.pingInterval);

				return;
			}

			console.log(`[ cluster ]\tproposed '${application}' v${version} for env '${env}' proposed to run on '${worker.name}'`);

			const proposal = {
				application,
				version,
				env,
				worker: worker.name,
				installing: false,
				requested: false,
				key: Crypto.createKey()
			};

			this.proposedInstalls.push(proposal);

			done(proposal);
		});
	}

	async validateClientAuth(req) {
		const username = req.headers["cluster-auth-username"];
		const key = req.headers["cluster-auth-key"];

		return new Promise<void>(done => {
			setTimeout(() => {
				if (!username || !fs.existsSync(RegistryServer.clientDirectory(username))) {
					throw new Error("user does not exist!");
				}
		
				if (fs.readFileSync(RegistryServer.clientKeyFile(username)).toString() != key) {
					throw new Error("invalid key!");
				}

				done();
			}, 500);
		});
	}
}