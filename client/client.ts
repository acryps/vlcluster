import * as fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import { Cluster } from "../cluster";
import { spawn } from "child_process";
import { Logger } from "../log";
import { hostname } from "os";

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
		const logger = new Logger("login");

		logger.log("logging into ", host, "...");

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

		logger.log("welcome to ", logger.c(result.name), "!");

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

	static async build(directory: string) {
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
		await logger.process(["pushing ", logger.av(application, version), "..."], async finished => {
			const imageName = `${application}:${version}`;
			
			const saveProcess = spawn("docker", ["save", imageName], {
				stdio: [
					"ignore",
					"pipe",
					process.stderr
				]
			});

			const uploader = fetch(`http://${this.host}:${Cluster.port}${Cluster.api.registry.push}`, {
				method: "POST", 
				headers: {
					...this.authHeaders,
					"cluster-application": application,
					"cluster-version": version,
					"cluster-image-name": imageName
				},
				body: saveProcess.stdout
			}).then(r => r.json());

			await new Promise<void>(done => {
				saveProcess.on("close", async () => {
					await uploader;

					finished(logger.av(application, version), " pushed");

					done();
				});
			});
		});
	}

	async upgrade(application: string, version: string, env: string) {
		const logger = new Logger("upgrade");
		
		await logger.process(["upgrading ", logger.aev(application, env, version), "..."], async finished => {
			await fetch(`http://${this.host}:${Cluster.port}${Cluster.api.registry.upgrade}`, {
				method: "POST",
				headers: {
					...this.authHeaders,
					"cluster-application": application,
					"cluster-version": version,
					"cluster-env": env
				}
			}).then(r => r.json());

			finished("upgraded ", logger.aev(application, env, version));
		});
	}

	async deploy(directory: string, env: string) {
		const app = await Client.build(directory);
		await this.push(app.application, app.version);
		await this.upgrade(app.application, app.version, env);
	}

	async mapDomain(host: string, port: number, application: string, env: string) {
		const logger = new Logger("map");

		await logger.process(["mapping ", logger.hp(host, port), " to ", logger.ae(application, env), "..."], async finished => {
			await fetch(`http://${this.host}:${Cluster.port}${Cluster.api.registry.map.domain}`, {
				method: "POST",
				headers: {
					...this.authHeaders,
					"cluster-host": host,
					"cluster-port": port,
					"cluster-application": application,
					"cluster-env": env
				}
			}).then(r => r.json());

			finished("mapped ", host, ":" + port, " to ", logger.ae(application, env));
		});
	}

	async mapWebSocket(host: string, port: number, path: string) {
		const logger = new Logger("map");

		await logger.process(["mapping websocket ", logger.hp(host, port), " on ", path, "..."], async finished => {
			const res = await fetch(`http://${this.host}:${Cluster.port}${Cluster.api.registry.map.webSocket}`, {
				method: "POST",
				headers: {
					...this.authHeaders,
					"cluster-host": host,
					"cluster-port": port,
					"cluster-websocket": path
				}
			}).then(r => r.json());

			finished("mapped websocket ", host, ":" + port, " on ", path, " to ", logger.ae(res.application, res.env));
		});
	}

	get authHeaders() {
		return {
			"cluster-auth-username": this.username,
			"cluster-auth-key": this.key
		}
	}
}