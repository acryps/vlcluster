import { Cluster } from "../cluster";
import * as fetch from "node-fetch";
import * as fs from "fs";
import { cpuUsage } from "os-utils";
import { spawn } from "child_process";
import { Crypto } from "../crypto";
import { InstanceState } from "./instance-state";
import { Logger } from "../log";
import { WorkerPath } from "./paths";
import { StartRequest } from "../registry/messages/start";
import { StopRequest } from "../registry/messages/stop";

export class WorkerServer {
	key: string;
	name: string;
	host: string;

	cpuUsage: number;

	logger: Logger;

	constructor(private clusterName: string) {
		this.logger = new Logger("worker");

		this.key = fs.readFileSync(WorkerPath.keyFile(clusterName)).toString();
		this.host = fs.readFileSync(WorkerPath.hostFile(clusterName)).toString();
		this.name = fs.readFileSync(WorkerPath.nameFile(clusterName)).toString();

		if (!fs.existsSync(WorkerPath.instancesDirectory(this.clusterName))) {
			fs.mkdirSync(WorkerPath.instancesDirectory(this.clusterName));
		}

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

		if (!fs.existsSync(WorkerPath.rootDirectory)) {
			fs.mkdirSync(WorkerPath.rootDirectory);
		}

		fs.mkdirSync(WorkerPath.workerDirectory(result.name));
		fs.writeFileSync(WorkerPath.keyFile(result.name), result.key);
		fs.writeFileSync(WorkerPath.hostFile(result.name), host);
		fs.writeFileSync(WorkerPath.nameFile(result.name), name);

		return {
			name: result.name
		};
	}

	static getInstalledClusterNames() {
		if (!fs.existsSync(WorkerPath.rootDirectory)) {
			return [];
		}

		return fs.readdirSync(WorkerPath.rootDirectory);
	}

	startPing() {
		this.ping();

		setInterval(() => {
			this.ping();
		}, Cluster.pingInterval);
	}

	ping() {
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
			for (let request of res.start as StartRequest[]) {
				this.start(request.application, request.version, request.env, request.instance);
			}

			for (let request of res.stop as StopRequest[]) {
				this.stop(request.instance);
			}
		}).catch(error => {
			this.logger.log("ping failed! ", error.message);
		})
	}

	startCPUMonitoring() {
		setInterval(() => {
			cpuUsage(v => this.cpuUsage = v);
		}, 10000);
	}

	async pull(application: string, version: string) {
		await this.logger.process(["pulling ", this.logger.av(application, version), "..."], finished => new Promise<void>(async done => {
			const loadProcess = spawn("docker", ["load"], {
				stdio: [
					"pipe",
					process.stdout,
					process.stderr
				]
			});

			const res = await fetch(`http://${this.host}:${Cluster.port}${Cluster.api.registry.pull}`, {
				method: "POST",
				headers: {
					"cluster-application": application,
					"cluster-version": version,
					"cluster-key": this.key,
					"cluster-worker": this.name
				}
			});

			res.body.pipe(loadProcess.stdin);

			res.body.on("finish", () => {
				loadProcess.on("exit", async () => {
					finished("loaded ", this.logger.av(application, version));
					done();
				});
			});
		}));
	}

	async start(application: string, version: string, env: string, instance: string) {
		if (!(await this.hasLoadedImage(application, version))) {
			await this.pull(application, version);
		}

		return await this.logger.process(["starting ", this.logger.aev(application, env, version), "..."], finished => new Promise<void>(async done => {
			const internalPort = await Crypto.getRandomPort();
			const externalPort = await Crypto.getRandomPort();

			const runProcess = spawn("docker", [
				"run",
				"--env", `PORT=${internalPort}`, // add port env variable
				"--env", `CLUSTER_APPLICATION=${application}`,
				"--env", `CLUSTER_INTERNAL_PORT=${internalPort}`,
				"--env", `CLUSTER_EXTERNAL_PORT=${externalPort}`,
				"--env", `CLUSTER_VERSION=${version}`,
				"--env", `CLUSTER_INSTANCE=${instance}`,
				"--env", `CLUSTER_NAME=${this.clusterName}`,
				"--env", `CLUSTER_WORKER=${this.name}`,
				"--env", `CLUSTER_REGISTRY=${this.host}`,
				"--env", `CLUSTER_ENV=${env}`,
				"--expose", internalPort.toString(), // export container port to docker interface
				"-p", `${externalPort}:${internalPort}`, // export port from docker interface to network
				"--name", instance, // tag container
				"-d", // detatch
				`${application}:${version}`
			], {
				stdio: [
					"ignore",
					process.stdout,
					process.stderr
				]
			});

			runProcess.on("exit", async () => {
				finished("started ", this.logger.aevi(application, env, version, instance));

				fs.mkdirSync(WorkerPath.instanceDirectory(this.clusterName, instance));
				fs.writeFileSync(WorkerPath.instanceApplicationFile(this.clusterName, instance), application);
				fs.writeFileSync(WorkerPath.instanceVersionFile(this.clusterName, instance), version);
				fs.writeFileSync(WorkerPath.instanceEnvFile(this.clusterName, instance), env);
				
				this.logger.process(["reporting start ", this.logger.aev(application, env, version), " to registry"], async finished => {
					await fetch(`http://${this.host}:${Cluster.port}${Cluster.api.registry.startedApplication}`, {
						method: "POST",
						headers: {
							"cluster-instance": instance,
							"cluster-port": externalPort
						}
					}).then(r => r.json());

					finished();
					done();
				});
			});
		}));
	}

	hasLoadedImage(application: string, version: string) {
		const divider = "_".repeat(100) + Math.random().toString(36).substr(2) + "_".repeat(100);

		return new Promise<boolean>(done => {
			const process = spawn("docker", [
				"images", 
				`--format={{.Repository}}${divider}{{.Tag}}`
			]);

			let output = "";

			process.stdout.on("data", data => {
				output += data;
			});

			process.on("exit", () => {
				done(output.includes(`${application}${divider}${version}`));
			});
		});
	}

	async stop(instance: string) {
		await this.logger.process(["stopping ", this.logger.i(instance)], finished => new Promise<void>(done => {
			const stopProcess = spawn("docker", [
				"stop",
				instance
			], {
				stdio: "ignore"
			});
			
			stopProcess.on("exit", () => {
				finished("stopped ", this.logger.i(instance));
	
				done();
			});
		}));
	}
}