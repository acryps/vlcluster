import { Cluster } from "../cluster";
import * as fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import { cpuUsage } from "os-utils";
import { spawn } from "child_process";

export class WorkerServer {
	key: string;
	name: string;
	host: string;

	cpuUsage: number;

	constructor(clusterName: string) {
		this.key = fs.readFileSync(WorkerServer.keyFile(clusterName)).toString();
		this.host = fs.readFileSync(WorkerServer.hostFile(clusterName)).toString();
		this.name = fs.readFileSync(WorkerServer.nameFile(clusterName)).toString();

		this.cpuUsage = 1;
	}

	static async create(host: string, name: string, key: string) {
		const result = await fetch(`http://${host}:${Cluster.port}${Cluster.api.registry.createWorker}`, {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				key,
				name
			})
		}).then(r => r.json());

		if (!fs.existsSync(this.rootDirectory)) {
			fs.mkdirSync(this.rootDirectory);
		}

		fs.mkdirSync(this.workerDirectory(result.name));
		fs.writeFileSync(WorkerServer.keyFile(result.name), result.key);
		fs.writeFileSync(WorkerServer.hostFile(result.name), host);
		fs.writeFileSync(WorkerServer.nameFile(result.name), name);

		return {
			name: result.name
		};
	}

	static getInstalledClusterNames() {
		if (!fs.existsSync(this.rootDirectory)) {
			return [];
		}

		return fs.readdirSync(this.rootDirectory);
	}

	static get rootDirectory() {
		return path.join(Cluster.localDirectory, "workers");
	}

	static workerDirectory(clusterName: string) {
		return path.join(this.rootDirectory, clusterName);
	}

	static keyFile(clusterName: string) {
		return path.join(this.workerDirectory(clusterName), "key");
	}

	static nameFile(clusterName: string) {
		return path.join(this.workerDirectory(clusterName), "name");
	}

	static hostFile(clusterName: string) {
		return path.join(this.workerDirectory(clusterName), "host");
	}

	register(app) {
		
	}

	startPing() {
		setInterval(() => {
			fetch(`http://${this.host}:${Cluster.port}${Cluster.api.registry.ping}`, {
				method: "POST", 
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					name: this.name,
					key: this.key,
					cpuUsage: this.cpuUsage
				})
			}).then(res => res.json()).then(res => {
				if (res.installRequests.length) {
					for (let request of res.installRequests) {
						console.log(`[ worker ]\tnew install request: '${request.application}' v${request.version} for env '${request.env}'`);

						this.install(request.application, request.version, request.env, request.key);
					}
				} else {
					console.log("[ worker ]\tping");
				}
			}).catch(error => {
				console.error(`[ worker ]\tping failed!`, error);
			})
		}, Cluster.pingInterval);
	}

	startCPUMonitoring() {
		setInterval(() => {
			cpuUsage(v => this.cpuUsage = v);
		}, 10000);
	}

	install(application: string, version: string, env: string, key: string) {
		return new Promise<void>(async done => {
			console.log(`[ worker ]\tinstalling '${application}' v${version} for env '${env}'`);

			const loadProcess = spawn("docker", ["load"], {
				stdio: [
					"pipe",
					process.stdout,
					process.stderr
				]
			});

			const res = await fetch(`http://${this.host}:${Cluster.port}${Cluster.api.registry.install}`, {
				method: "POST",
				headers: {
					"cluster-key": key
				}
			});

			console.log(`[ worker ]\tloading '${application}' v${version}`);
			res.body.pipe(loadProcess.stdin);

			res.body.on("finish", () => {
				console.log(`[ worker ]\tloaded '${application}' v${version}`);

				done();
			});
		});
	}
}