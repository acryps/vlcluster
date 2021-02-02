import { Crypto } from "../crypto";
import { Cluster } from "../cluster";
import * as fetch from "node-fetch";
import * as fs from "fs";
import { Logger } from "../log";
import { ChildInstance, ChildWorker } from "./worker";
import { RegistryPath } from "./paths";
import { StartRequest } from "./messages/start";
import { StopRequest } from "./messages/stop";
import { threadId } from "worker_threads";

export class RegistryServer {
	key: string;
	logger: Logger = new Logger("registry");;

	runningWorkers: ChildWorker[] = [];

	pendingStartRequests: StartRequest[] = [];
	pendingStopRequests: StopRequest[] = [];

	constructor() {
		if (!RegistryServer.isInstalled()) {
			throw new Error("no registry installed on this host!");
		}

		this.key = fs.readFileSync(RegistryPath.keyFile).toString();
	}

	createWorker(name: string) {
		this.logger.log("creating worker ", this.logger.w(name));

		if (fs.existsSync(RegistryPath.workerDirectory(name))) {
			throw new Error("worker already registered");
		}

		const key = Crypto.createKey();

		// create worker directory
		fs.mkdirSync(RegistryPath.workerDirectory(name));
		fs.writeFileSync(RegistryPath.workerKeyFile(name), key);

		this.logger.log("created worker ", this.logger.w(name));

		return key;
	}

	createClient(name: string) {
		const key = Crypto.createKey();

		this.logger.log(`creating client ${name}`);

		if (fs.existsSync(RegistryPath.clientDirectory(name))) {
			throw new Error(`client '${name}' already exists!`);
		}

		fs.mkdirSync(RegistryPath.clientDirectory(name));
		fs.writeFileSync(RegistryPath.clientKeyFile(name), key);

		this.logger.log("created client");

		return key;
	}

	createGateway(name: string, host: string) {
		const key = Crypto.createKey();

		this.logger.log(`creating gateway ${name}`);

		if (fs.existsSync(RegistryPath.gatewayDirectory(name))) {
			throw new Error(`gateway '${name}' already exists!`);
		}

		if (!fs.existsSync(RegistryPath.gatewaysDirectory)) {
			fs.mkdirSync(RegistryPath.gatewaysDirectory);
		}

		fs.mkdirSync(RegistryPath.gatewayDirectory(name));
		fs.writeFileSync(RegistryPath.gatewayHostFile(name), host);
		fs.writeFileSync(RegistryPath.gatewayKeyFile(name), key);

		this.logger.log("created gateway");

		return key;
	}

	static isInstalled() {
		return fs.existsSync(RegistryPath.rootDirectory);
	}

	static async create(name: string) {
		// generate key
		const key = Crypto.createKey();

		// create registry directory
		fs.mkdirSync(RegistryPath.rootDirectory);

		// create files
		fs.writeFileSync(RegistryPath.keyFile, key);
		fs.writeFileSync(RegistryPath.nameFile, name);

		// create registry
		fs.mkdirSync(RegistryPath.workersDirectory);
		fs.mkdirSync(RegistryPath.clientsDirectory);
		fs.mkdirSync(RegistryPath.applicationsDirectory);
		fs.mkdirSync(RegistryPath.mappingsDirectory);
		fs.mkdirSync(RegistryPath.variablesDirectory);

		return key;
	}

	get name() {
		return fs.readFileSync(RegistryPath.nameFile).toString();
	}

	register(app) {
		app.post(Cluster.api.registry.createWorker, (req, res) => {
			if (this.key != req.body.key) {
				throw new Error(`invalid key login attepted`);
			}

			const key = this.createWorker(req.body.name);

			res.json({
				key: key,
				name: this.name
			});
		});

		app.post(Cluster.api.registry.createClient, (req, res) => {
			if (this.key != req.body.key) {
				throw new Error(`invalid key login attepted`);
			}

			const key = this.createClient(req.body.username);

			res.json({
				key,
				name: this.name
			});
		});

		app.post(Cluster.api.registry.createGateway, (req, res) => {
			if (this.key != req.body.key) {
				throw new Error(`invalid key login attepted`);
			}

			const key = this.createGateway(req.body.name, req.body.host);

			res.json({
				key
			});
		});

		app.post(Cluster.api.registry.push, async (req, res) => {
			await this.validateClientAuth(req);

			const application = req.headers["cluster-application"];
			const version = req.headers["cluster-version"];
			const imageName = req.headers["cluster-image-name"];

			if (!application) {
				throw new Error(`no application name!`);
			}

			if (!version) {
				throw new Error(`no version!`);
			}

			this.logger.log("create ", this.logger.av(application, version));

			if (!fs.existsSync(RegistryPath.applicationDirectory(application))) {
				this.logger.log(`create new application '${application}'`);

				fs.mkdirSync(RegistryPath.applicationDirectory(application));
				fs.mkdirSync(RegistryPath.applicationVersionsDirectory(application));
				fs.mkdirSync(RegistryPath.applicationEnvsDirectory(application));
			}

			if (fs.existsSync(RegistryPath.applicationVersionDirectory(application, version))) {
				throw new Error(`version '${version}' of application '${application}' already exists!`);
			}

			fs.mkdirSync(RegistryPath.applicationVersionDirectory(application, version));
			fs.writeFileSync(RegistryPath.applicationVersionImageIdFile(application, version), imageName);

			this.logger.log("receiving ", this.logger.av(application, version), " image...");
			req.pipe(fs.createWriteStream(RegistryPath.applicationVersionImageSourceFile(application, version)));

			req.on("end", () => {
				this.logger.log("saved ", this.logger.av(application, version), " image");

				res.json({});
			})
		});

		app.post(Cluster.api.registry.upgrade, async (req, res) => {
			await this.validateClientAuth(req);

			const env = req.headers["cluster-env"];
			const application = req.headers["cluster-application"];
			const version = req.headers["cluster-version"];

			if (!fs.existsSync(RegistryPath.applicationVersionDirectory(application, version))) {
				throw new Error("application or version does not exist!");
			}

			this.logger.log("upgrading to ", this.logger.av(application, version));
			await this.upgrade(application, version, env);

			res.json({});
		});

		app.post(Cluster.api.registry.set, async (req, res) => {
			await this.validateClientAuth(req);

			const name = req.headers["cluster-name"];
			const value = req.headers["cluster-value"];
			const application = req.headers["cluster-application"];
			const env = req.headers["cluster-env"];

			this.logger.log("setting ", name, " to ", value, " for ", this.logger.ae(application || "*", env || "*"));
			await this.set(name, value, application, env);

			res.json({});
		});

		app.post(Cluster.api.registry.map.domain, async (req, res) => {
			await this.validateClientAuth(req);

			const host = req.headers["cluster-host"];
			const port = +req.headers["cluster-port"];
			const application = req.headers["cluster-application"];
			const env = req.headers["cluster-env"];

			this.logger.log("mapping ", this.logger.hp(host, port), " to ", this.logger.ae(application, env));
			await this.mapDomain(host, port, application, env);

			res.json({});
		});

		app.post(Cluster.api.registry.map.webSocket, async (req, res) => {
			await this.validateClientAuth(req);

			const host = req.headers["cluster-host"];
			const port = +req.headers["cluster-port"];
			const path = req.headers["cluster-websocket"];

			this.logger.log("mapping ", this.logger.hp(host, port), " on ", path);
			
			res.json(await this.mapWebSocket(host, port, path));
		});

		app.post(Cluster.api.registry.ping, (req, res) => {
			const name = req.body.name;
			const key = req.body.key;
			const cpuUsage = req.body.cpuUsage;
			const endpoint = req.body.endpoint;

			if (!name) {
				throw new Error("no name!");
			}

			if (key != fs.readFileSync(RegistryPath.workerKeyFile(name)).toString()) {
				throw new Error("invalid key!");
			}

			let worker = this.runningWorkers.find(s => s.name == name);
			const now = new Date();

			if (!worker) {
				worker = new ChildWorker();
				worker.name = name;
				worker.cpuUsage = cpuUsage;
				worker.lastSeen = now;
				worker.up = true;
				worker.endpoint = endpoint;

				this.runningWorkers.push(worker);

				if (endpoint) {
					this.logger.log("worker login ", this.logger.w(name), " on ", endpoint);
				} else {
					this.logger.log("worker login ", this.logger.w(name));
				} 
			} else {
				if (!worker.up) {
					this.updateGateways();
				}

				worker.cpuUsage = cpuUsage;
				worker.lastSeen = now;
				worker.up = true;
				worker.endpoint = endpoint;
			}

			const messages = [...worker.messageQueue];
			worker.messageQueue = [];

			// timeout check
			setTimeout(() => {
				if (worker.lastSeen == now) {
					this.logger.log(this.logger.w(name), " ping timed out");

					worker.up = false;

					this.updateGateways();

					for (let message of messages) {
						if (message instanceof StartRequest) {
							const request = message;
							
							this.logger.log("proposal ", this.logger.aev(request.application, request.env, request.version), " for ", this.logger.w(worker.name), " timed out");

							this.start(request.application, request.version, request.env).then(() => {
								request.oncomplete(request);
							});
						}
					}
				}
			}, Cluster.pingTimeout);

			res.json({
				start: messages.filter(m => m instanceof StartRequest),
				stop: messages.filter(m => m instanceof StopRequest)
			});
		});

		app.post(Cluster.api.registry.pull, (req, res) => {
			const application = req.headers["cluster-application"];
			const version = req.headers["cluster-version"];
			const key = req.headers["cluster-key"];
			const worker = req.headers["cluster-worker"];
			
			if (!fs.existsSync(RegistryPath.workerDirectory(worker))) {
				throw new Error("worker does not exist");
			}

			if (fs.readFileSync(RegistryPath.workerKeyFile(worker)).toString() != key) {
				throw new Error("invalid key");
			}

			if (!fs.existsSync(RegistryPath.applicationDirectory(application))) {
				throw new Error("application does not exist");
			}

			if (!fs.existsSync(RegistryPath.applicationVersionDirectory(application, version))) {
				throw new Error("application does not exist");
			}

			this.logger.log("sending ", this.logger.av(application, version), " to ", this.logger.w(worker));
			
			new Promise<void>(done => {
				fs.createReadStream(RegistryPath.applicationVersionImageSourceFile(application, version)).pipe(res).on("end", () => {
					this.logger.log("sent ", this.logger.av(application, version), " to ", this.logger.w(worker));

					done();
				})
			});
		});

		app.post(Cluster.api.registry.startedApplication, (req, res) => {
			const workerName = req.headers["cluster-worker"];
			const instance = req.headers["cluster-instance"];
			const env = req.headers["cluster-env"];
			const version = req.headers["cluster-verison"];
			const application = req.headers["cluster-application"];
			const port = +req.headers["cluster-port"];

			const request = this.pendingStartRequests.find(i => i.instance == instance);
			const worker = this.runningWorkers.find(w => w.name == workerName);

			const state = new ChildInstance();
			state.application = application;
			state.version = version;
			state.env = env;
			state.id = instance;
			state.port = port;

			state.worker = worker;

			worker.instances[instance] = state;

			this.updateGateways();

			if (!request) {
				this.logger.log(this.logger.aevi(application, env, version, instance), " started on ", this.logger.w(workerName), " exposing ", this.logger.p(port));

				res.json({});

				return;
			}

			request.oncomplete(request);

			res.json({});
		});

		app.post(Cluster.api.registry.stoppedApplication, (req, res) => {
			const instance = req.headers["cluster-instance"];

			const request = this.pendingStopRequests.find(i => i.instance == instance);

			if (request) {
				request.oncomplete();
			}

			res.json({});
		});
	}

	async updateGateways() {
		this.logger.log("updating gateways...");

		const routes = [];

		for (let id of fs.readdirSync(RegistryPath.mappingsDirectory)) {
			const host = fs.readFileSync(RegistryPath.mappingHostFile(id)).toString();
			const port = +fs.readFileSync(RegistryPath.mappingPortFile(id)).toString();
			const env = fs.readFileSync(RegistryPath.mappingEnvFile(id)).toString();
			const application = fs.readFileSync(RegistryPath.mappingApplicationFile(id)).toString();

			const latestVersion = fs.readFileSync(RegistryPath.applicationEnvLatestVersionFile(application, env)).toString();

			const instances = [];
			const sockets = [];

			for (let worker of this.runningWorkers) {
				if (worker.endpoint) {
					for (let id in worker.instances) {
						const instance = worker.instances[id];

						if (instance.application == application && instance.env == env && instance.version == latestVersion) {
							instances.push({
								endpoint: instance.worker.endpoint,
								port: instance.port
							});
						}
					}
				} else {
					this.logger.log("no endpoint set, skipped ", this.logger.w(worker.name), "");
				}
			}

			if (fs.existsSync(RegistryPath.mappingWebSocketsDirectory(id))) {
				for (let socket of fs.readdirSync(RegistryPath.mappingWebSocketsDirectory(id))) {
					sockets.push(fs.readFileSync(RegistryPath.mappingWebSocketFile(id, socket)).toString());
				}
			}

			if (instances.length) {
				routes.push({
					application,
					env,
					host,
					port,
					instances,
					sockets
				});
			} else {
				this.logger.log("no instances of ", this.logger.ae(application, env), " running, skipped");
			}
		}

		for (let gateway of fs.readdirSync(RegistryPath.gatewaysDirectory)) {
			const host = fs.readFileSync(RegistryPath.gatewayHostFile(gateway)).toString();
			const key = fs.readFileSync(RegistryPath.gatewayKeyFile(gateway)).toString();

			this.logger.log("upgrading ", this.logger.g(gateway), "...");

			await fetch(`http://${host}:${Cluster.port}${Cluster.api.gateway.reload}`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"cluster-key": key
				},
				body: JSON.stringify(routes)
			}).then(r => r.json());

			this.logger.log("upgraded ", this.logger.g(gateway));
		}

		this.logger.log("updated gateways");
	}

	async upgrade(application: string, version: string, env: string) {
		this.logger.log("upgrade ", this.logger.aev(application, env, version));
		
		if (!fs.existsSync(RegistryPath.applicationEnvDirectory(application, env))) {
			fs.mkdirSync(RegistryPath.applicationEnvDirectory(application, env));
			fs.mkdirSync(RegistryPath.applicationEnvActiveVersionsDirectory(application, env));

			this.logger.log("new env ", this.logger.ae(application, env));
		}

		if (fs.existsSync(RegistryPath.applicationEnvDangelingVersionFile(application, env))) {
			throw new Error("cannot upgrade. upgrade already in progress!");
		}

		let dangelingVersion;
		
		if (fs.existsSync(RegistryPath.applicationEnvLatestVersionFile(application, env))) {
			dangelingVersion = fs.readFileSync(RegistryPath.applicationEnvLatestVersionFile(application, env)).toString();

			fs.writeFileSync(RegistryPath.applicationEnvDangelingVersionFile(application, env), dangelingVersion);
		} 

		fs.mkdirSync(RegistryPath.applicationEnvActiveVersionDirectory(application, env, version));

		// install application on new worker
		await this.start(application, version, env);

		// write current version file
		fs.writeFileSync(RegistryPath.applicationEnvLatestVersionFile(application, env), version);

		// wait for gateway updates
		await this.updateGateways();
		
		// stop dangeling versions
		if (dangelingVersion) {
			this.stop(application, dangelingVersion, env);

			fs.unlinkSync(RegistryPath.applicationEnvDangelingVersionFile(application, env));
		}
	}

	start(application: string, version: string, env: string) {
		const instance = Crypto.createId();

		return new Promise<StartRequest>(done => {
			const worker = this.runningWorkers.filter(w => w.up).sort((a, b) => a.cpuUsage - b.cpuUsage)[0];

			if (!worker) {
				this.logger.log("out of workers to run ", this.logger.aev(application, env, version), "! retrying...");

				setTimeout(async () => {
					done(await this.start(application, version, env));
				}, Cluster.pingInterval);

				return;
			}

			this.logger.log("requesting start ", this.logger.aevi(application, version, env, instance), " on ", this.logger.w(worker.name));

			const request = new StartRequest();
			request.application = application;
			request.version = version;
			request.env = env;
			request.instance = instance;
			request.variables = {};

			// resolve variables
			for (let variable of fs.readdirSync(RegistryPath.variablesDirectory)) {
				const name = fs.readFileSync(RegistryPath.variableNameFile(variable)).toString();
				const value = fs.readFileSync(RegistryPath.variableValueFile(variable)).toString();

				if (fs.existsSync(RegistryPath.variableApplicationFile(variable))) {
					if (fs.readFileSync(RegistryPath.variableApplicationFile(variable)).toString() == application) {
						if (fs.existsSync(RegistryPath.variableEnvFile(variable))) {
							if (fs.readFileSync(RegistryPath.variableEnvFile(variable)).toString() == env) {
								request.variables[name] = value;
							}
						} else {
							request.variables[name] = value;
						}
					}
				} else {
					request.variables[name] = value;
				}
			}

			this.pendingStartRequests.push(request);

			request.oncomplete = status => {
				request.port = status.port;

				if (!fs.existsSync(RegistryPath.applicationEnvActiveVersionWorkerDirectory(application, env, version, worker.name))) {
					fs.mkdirSync(RegistryPath.applicationEnvActiveVersionWorkerDirectory(application, env, version, worker.name));
				}

				fs.writeFileSync(
					RegistryPath.applicationEnvActiveVersionWorkerInstanceFile(application, env, version, worker.name, instance),
					instance
				);

				this.logger.log("started ", this.logger.aevi(application, version, env, instance), " on ", this.logger.w(worker.name));

				done(request);
			};

			worker.messageQueue.push(request);
		});
	}

	async stop(application: string, version: string, env: string) {
		this.logger.log("shutting down ", this.logger.aev(application, version, env));

		for (let worker of [...fs.readdirSync(RegistryPath.applicationEnvActiveVersionDirectory(application, env, version))]) {
			for (let instance of [...fs.readdirSync(RegistryPath.applicationEnvActiveVersionWorkerDirectory(application, env, version, worker))]) {
				await this.stopInstance(application, version, env, worker, instance);
			}
		}

		this.logger.log("shut down ", this.logger.aev(application, version, env));
	}

	async stopInstance(application: string, version: string, env: string, workerName: string, instance: string) {
		const worker = this.runningWorkers.find(w => w.name == workerName);

		if (!worker) {
			this.logger.log("skipping shut down of ", this.logger.wi(workerName, instance), ". worker down");

			return;
		}
		
		await this.logger.log("requesting shutdown ", this.logger.wi(workerName, instance));

		const request = new StopRequest();
		request.instance = instance;
		
		this.pendingStopRequests.push(request);
		worker.messageQueue.push(request);
		
		await new Promise<void>(done => {
			request.oncomplete = () => {
				// remove instance file
				fs.unlinkSync(RegistryPath.applicationEnvActiveVersionWorkerInstanceFile(application, env, version, worker.name, instance));

				// remove worker directory if no other instances are running
				if (!fs.readdirSync(RegistryPath.applicationEnvActiveVersionWorkerDirectory(application, env, version, worker.name)).length) {
					fs.rmdirSync(RegistryPath.applicationEnvActiveVersionWorkerDirectory(application, env, version, worker.name));
				}

				// remove version directory if no other instances are running
				if (!fs.readdirSync(RegistryPath.applicationEnvActiveVersionDirectory(application, env, version)).length) {
					fs.rmdirSync(RegistryPath.applicationEnvActiveVersionDirectory(application, env, version));
				}

				this.logger.log("stopped ", this.logger.wi(workerName, instance));

				done();
			};
		});
	}

	async validateClientAuth(req) {
		const username = req.headers["cluster-auth-username"];
		const key = req.headers["cluster-auth-key"];

		return new Promise<void>(done => {
			setTimeout(() => {
				if (!username || !fs.existsSync(RegistryPath.clientDirectory(username))) {
					throw new Error("user does not exist!");
				}
		
				if (fs.readFileSync(RegistryPath.clientKeyFile(username)).toString() != key) {
					throw new Error("invalid key!");
				}

				done();
			}, 500);
		});
	}

	async set(name: string, value: string, application: string, env: string) {
		const id = Crypto.createId();

		fs.mkdirSync(RegistryPath.variableDirectory(id));

		fs.writeFileSync(RegistryPath.variableNameFile(id), name);
		fs.writeFileSync(RegistryPath.variableValueFile(id), value);

		if (application) {
			fs.writeFileSync(RegistryPath.variableApplicationFile(id), application);
		}

		if (env) {
			fs.writeFileSync(RegistryPath.variableEnvFile(id), env);
		}
	}

	async mapDomain(host: string, port: number, application: string, env: string) {
		const id = Crypto.createId();

		fs.mkdirSync(RegistryPath.mappingDirectory(id));

		fs.writeFileSync(RegistryPath.mappingApplicationFile(id), application);
		fs.writeFileSync(RegistryPath.mappingEnvFile(id), env);
		fs.writeFileSync(RegistryPath.mappingHostFile(id), host);
		fs.writeFileSync(RegistryPath.mappingPortFile(id), port + "");

		await this.updateGateways();
	}

	async mapWebSocket(socketHost: string, socketPort: number, socketPath: string) {
		for (let id of fs.readdirSync(RegistryPath.mappingsDirectory)) {
			const host = fs.readFileSync(RegistryPath.mappingHostFile(id)).toString();
			const port = +fs.readFileSync(RegistryPath.mappingPortFile(id)).toString();

			if (host == socketHost && port == socketPort) {
				if (!fs.existsSync(RegistryPath.mappingWebSocketsDirectory(id))) {
					fs.mkdirSync(RegistryPath.mappingWebSocketsDirectory(id));
				}

				fs.writeFileSync(RegistryPath.mappingWebSocketFile(id, Crypto.nameHash(socketPath)), socketPath);

				await this.updateGateways();

				return {
					application: fs.readFileSync(RegistryPath.mappingApplicationFile(id)).toString(),
					env: fs.readFileSync(RegistryPath.mappingEnvFile(id)).toString()
				};
			}
		}

		throw new Error(`No domain '${socketHost}:${socketPort}' registered`);
	}
}