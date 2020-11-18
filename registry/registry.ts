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
		fs.mkdirSync(RegistryServer.imagesDirectory);

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

	static get imagesDirectory() {
		return path.join(this.rootDirectory, "images");
	}

	static imageDirectory(id: string) {
		return path.join(this.imagesDirectory, id);
	}

	static imageApplicationName(id: string) {
		return path.join(this.imageDirectory(id), "application");
	}

	static imageVersion(id: string) {
		return path.join(this.imageDirectory(id), "version");
	}

	static imageUploadKey(id: string) {
		return path.join(this.imageDirectory(id), "key");
	}

	static imageSource(id: string) {
		return path.join(this.imageDirectory(id), "image");
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

			if (!req.body.name) {
				throw new Error(`no application name set`);
			}

			if (!req.body.version) {
				throw new Error(`no version set`);
			}

			console.log(`[ registry ]\tcreate '${req.body.name}' v${req.body.version}`);

			const id = Crypto.imageKey(req.body.name, req.body.version);
			const uploadKey = Crypto.createKey();

			if (fs.existsSync(RegistryServer.imageDirectory(id))) {
				console.log(`[registry]\timage of '${req.body.name}' v${req.body.version}`)

				throw new Error("version already exists");
			}

			fs.mkdirSync(RegistryServer.imageDirectory(id));
			fs.writeFileSync(RegistryServer.imageApplicationName(id), req.body.name);
			fs.writeFileSync(RegistryServer.imageVersion(id), req.body.version);
			fs.writeFileSync(RegistryServer.imageUploadKey(id), uploadKey);

			res.json({
				id,
				key: uploadKey
			});
		});

		app.post(Cluster.api.registry.uploadImage, (req, res) => {
			const id = req.headers.imageid;
			const key = req.headers.imagekey;

			if (!id) {
				throw new Error("no image id set");
			}

			if (!key) {
				throw new Error("no upload key set");
			}

			if (!fs.existsSync(RegistryServer.imageUploadKey(id))) {
				throw new Error("image not found");
			}

			if (fs.readFileSync(RegistryServer.imageUploadKey(id)) != key) {
				throw new Error("invalid key");
			}

			const application = fs.readFileSync(RegistryServer.imageApplicationName(id));
			const version = fs.readFileSync(RegistryServer.imageVersion(id));

			console.log(`[registry]\nuploading image '${application}' v${version}`);
			req.pipe(fs.createWriteStream(RegistryServer.imageSource(id)));
		});
	}
}