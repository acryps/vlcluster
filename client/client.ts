import * as fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import { Cluster } from "../cluster";
import { spawn } from "child_process";
import { Logger } from "../log";

export class Client {
	host: string;
	key: string;
	username: string;

	constructor(public clusterName: string) {
		if (!Client.hasCluster(clusterName)) {
			throw new Error(`Cluster '${clusterName}' not found!`);
		}

		this.host = fs.readFileSync(Client.clusterHostFile(clusterName)).toString();
		this.key = fs.readFileSync(Client.clusterKeyFile(clusterName)).toString();
		this.username = fs.readFileSync(Client.clusterUsernameFile(clusterName)).toString();
	}

	static hasCluster(name: string) {
		return fs.existsSync(this.clusterDirectory(name));
	}

	static async create(username: string, host: string, key: string) {
		console.log(`[ client ] logging into ${host}...`);

		const result = await fetch(`http://${host}:${Cluster.port}${Cluster.api.registry.createClient}`, {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				key,
				username
			})
		}).then(r => r.json());

		console.log(`[ client ] welcome to '${result.name}'!`);

		if (!fs.existsSync(Client.clusterDirectory(result.name))) {
			fs.mkdirSync(Client.clusterDirectory(result.name));
		}

		fs.writeFileSync(Client.clusterKeyFile(result.name), result.key);
		fs.writeFileSync(Client.clusterUsernameFile(result.name), username);
		fs.writeFileSync(Client.clusterHostFile(result.name), host);

		return {
			name: result.name
		};
	}

	static clusterDirectory(name: string) {
		return path.join(Cluster.clustersDirectory, name);
	}

	static clusterKeyFile(name: string) {
		return path.join(this.clusterDirectory(name), "key");
	}

	static clusterUsernameFile(name: string) {
		return path.join(this.clusterDirectory(name), "username");
	}

	static clusterHostFile(name: string) {
		return path.join(this.clusterDirectory(name), "host");
	}

	async build(directory: string) {
		const logger = new Logger("build");
		const packagePath = path.join(directory, "package.json");

		if (!fs.existsSync(packagePath)) {
			throw new Error(`no package.json found in ${directory}`);
		}

		const packageConfiguration = JSON.parse(fs.readFileSync(packagePath).toString());

		if (!packageConfiguration.name) {
			throw new Error(`no name in ${packagePath} set!`);
		}

		if (!packageConfiguration.version) {
			throw new Error(`no version in ${packagePath} set!`);
		}

		logger.log("building ", logger.av(packageConfiguration.name, packageConfiguration.version), "...");
		const buildProcess = spawn("docker", ["build", "-t", `${packageConfiguration.name}:${packageConfiguration.version}`, "."], {
			cwd: directory,
			stdio: [
				"ignore",
				process.stdout,
				process.stderr
			]
		});

		await new Promise<void>((done, reject) => {
			buildProcess.on("close", code => {
				if (code) {
					return reject(new Error("docker build failed!"));
				}

				done();
			})
		});

		logger.log("image ", logger.av(packageConfiguration.name, packageConfiguration.version), " built!");

		return {
			application: packageConfiguration.name,
			version: packageConfiguration.version
		};
	}

	async push(application: string, version: string) {
		const logger = new Logger("push");

		logger.log(`creating image '${application}' v${version} in registry...`);

		const uploadRequestResult = await fetch(`http://${this.host}:${Cluster.port}${Cluster.api.registry.createImage}`, {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				key: this.key,
				username: this.username,
				name: application,
				version: version
			})
		}).then(r => r.json());

		logger.log(`uploading image...`);
		
		const saveProcess = spawn("docker", ["save", `${application}:${version}`], {
			stdio: [
				"ignore",
				"pipe",
				process.stderr
			]
		});

		const uploader = fetch(`http://${this.host}:${Cluster.port}${Cluster.api.registry.uploadImage}`, {
			method: "POST", 
			headers: {
				"cluster-application": application,
				"cluster-version": version,
				"cluster-key": uploadRequestResult.key,
				"cluster-image-id": `${application}:${version}`
			},
			body: saveProcess.stdout
		}).then(r => r.json());

		await new Promise<void>(done => {
			saveProcess.on("close", async () => {
				await uploader;

				done();
			})
		});

		logger.log(`image pushed`);
	}

	async upgrade(application: string, version: string, env: string) {
		const logger = new Logger("upgrade");
		logger.log("requesting upgrade of ", logger.av(application, version), "...");

		await fetch(`http://${this.host}:${Cluster.port}${Cluster.api.registry.upgrade}`, {
			method: "POST",
			headers: {
				...this.authHeaders,
				"cluster-application": application,
				"cluster-version": version,
				"cluster-env": env
			}
		}).then(r => r.json());

		logger.log("request submitted. the update will be rolled out now");
	}

	async deploy(directory: string, env: string) {
		const app = await this.build(directory);
		await this.push(app.application, app.version);
		await this.upgrade(app.application, app.version, env);
	}

	get authHeaders() {
		return {
			"cluster-auth-username": this.username,
			"cluster-auth-key": this.key
		}
	}
}