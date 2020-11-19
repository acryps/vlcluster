import { Crypto } from "../crypto";
import { Cluster } from "../cluster";
import * as fs from "fs";
import * as path from "path";

export class RegistryServer {
	key: string;
	workers: [];
	gateways: [];
	imageHosts: [];

	constructor() {
		if (!RegistryServer.isInstalled()) {
			throw new Error("No registry installed on this host!");
		}

		this.key = fs.readFileSync(RegistryServer.keyFile).toString();
	}

	createWorker(hostname: string) {
		hostname = Crypto.hostIdentifier(hostname);

		console.log(`[ registry ]\tcreating worker on '${hostname}'`);

		if (fs.existsSync(RegistryServer.workerDirectory(hostname))) {
			throw new Error("worker already registered");
		}

		const key = Crypto.createKey();

		// create worker directory
		fs.mkdirSync(RegistryServer.workerDirectory(hostname));
		fs.writeFileSync(RegistryServer.workerKeyFile(hostname), key);

		console.log(`[ registry ]\tcreated worker on '${hostname}'`);

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
		return path.join(this.applicationsDirectory, Crypto.nameHash(name));
	}

	static applicationNameFile(id: string) {
		return path.join(this.applicationsDirectory, id, "name");
	}

	static applicationVersionsDirectory(name: string) {
		return path.join(this.applicationDirectory(name), "versions");
	}

	static applicationVersionDirectory(name: string, version: string) {
		return path.join(this.applicationVersionsDirectory(name), version.replaceAll(/[^0-9a-z\-\_\.]/g, ""));
	}

	static applicationVersionImageSourceFile(name: string, version: string) {
		return path.join(this.applicationVersionDirectory(name, version), "source");
	}

	static applicationVersionImageKeyFile(name: string, version: string) {
		return path.join(this.applicationVersionDirectory(name, version), "key");
	}

	static get workersDirectory() {
		return path.join(this.rootDirectory, "workers");
	}

	static workerDirectory(hostname: string) {
		return path.join(this.workersDirectory, hostname);
	}

	static workerKeyFile(hostname: string) {
		return path.join(this.workerDirectory(hostname), "key");
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

			const key = this.createWorker(req.body.host);

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
				fs.writeFileSync(RegistryServer.applicationNameFile(Crypto.nameHash(application)), application);
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

			if (!fs.existsSync(RegistryServer.applicationVersionDirectory(application, version))) {
				throw new Error("version does not exists!")
			}

			if (fs.readFileSync(RegistryServer.applicationVersionImageKeyFile(application, version)) == key) {
				throw new Error("no upload key set");
			}

			console.log(`[registry]\nuploading image v${version}`);
			req.pipe(fs.createWriteStream(RegistryServer.applicationVersionImageSourceFile(application, version)));

			req.on("end", () => {
				res.json({
					size: fs.lstatSync(
						RegistryServer.applicationVersionImageSourceFile(application, version)
					).size
				})
			})
		});
	}
}