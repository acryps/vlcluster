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
	}
}