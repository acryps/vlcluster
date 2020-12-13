import { Cluster } from "../cluster";
import * as fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import { cpuUsage } from "os-utils";
import { spawn } from "child_process";
import { loadavg } from "os";
import { Crypto } from "../crypto";
import { Worker } from "cluster";
import { InstanceState } from "./instance-state";
import { Logger } from "../log";

export class WorkerServer {
	key: string;
	name: string;
	host: string;

	cpuUsage: number;

	logger: Logger;

	constructor(private clusterName: string) {
		this.logger = new Logger("worker");

		this.key = fs.readFileSync(WorkerServer.keyFile(clusterName)).toString();
		this.host = fs.readFileSync(WorkerServer.hostFile(clusterName)).toString();
		this.name = fs.readFileSync(WorkerServer.nameFile(clusterName)).toString();

		if (!fs.existsSync(WorkerServer.applicationsDirectory(this.clusterName))) {
			fs.mkdirSync(WorkerServer.applicationsDirectory(this.clusterName));
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

	static applicationsDirectory(clusterName: string) {
		return path.join(this.workerDirectory(clusterName), "applications");
	}

	static applicationDirectory(clusterName: string, application: string) {
		return path.join(this.applicationsDirectory(clusterName), Crypto.sanitizeApplicationName(application));
	}

	static applicationVersionsDirecotry(clusterName: string, application: string) {
		return path.join(this.applicationDirectory(clusterName, application), "versions");
	}

	static applicationVersionDirectory(clusterName: string, application: string, version: string) {
		return path.join(this.applicationVersionsDirecotry(clusterName, application), Crypto.sanitizeVersion(version));
	}

	static applicationVersionImageIdFile(clusterName: string, application: string, version: string) {
		return path.join(this.applicationVersionDirectory(clusterName, application, version), "image-id");
	}

	static applicationEnvsDirecotry(clusterName: string, application: string) {
		return path.join(this.applicationDirectory(clusterName, application), "envs");
	}

	static applicationEnvDirecotry(clusterName: string, application: string, env: string) {
		return path.join(this.applicationEnvsDirecotry(clusterName, application), env);
	}

	static applicationEnvVersionFile(clusterName: string, application: string, env: string) {
		return path.join(this.applicationEnvDirecotry(clusterName, application, env), "version");
	}

	static applicationEnvInstancesDirecotry(clusterName: string, application: string, env: string) {
		return path.join(this.applicationEnvDirecotry(clusterName, application, env), "instances");
	}

	static applicationEnvInstanceDirecotry(clusterName: string, application: string, env: string, instance: string) {
		return path.join(this.applicationEnvInstancesDirecotry(clusterName, application, env), instance);
	}

	static applicationEnvInstanceVersionFile(clusterName: string, application: string, env: string, instance: string) {
		return path.join(this.applicationEnvInstanceDirecotry(clusterName, application, env, instance), "version");
	}

	static applicationEnvInstanceInternalPortFile(clusterName: string, application: string, env: string, instance: string) {
		return path.join(this.applicationEnvInstanceDirecotry(clusterName, application, env, instance), "internal-port");
	}

	static applicationEnvInstanceExternalPortFile(clusterName: string, application: string, env: string, instance: string) {
		return path.join(this.applicationEnvInstanceDirecotry(clusterName, application, env, instance), "external-port");
	}

	register(app) {
		
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
			if (res.installRequests.length) {
				for (let request of res.installRequests) {
					this.logger.log("received install request for ", this.logger.aev(request.application, request.env, request.version));

					this.install(request.application, request.version, request.env, request.key, request.imageId);
				}
			}
			
			process.stdout.write("🏓");
		}).catch(error => {
			console.error(`[ worker ]\tping failed!`, error);
		})
	}

	startCPUMonitoring() {
		setInterval(() => {
			cpuUsage(v => this.cpuUsage = v);
		}, 10000);
	}

	install(application: string, version: string, env: string, key: string, imageId: string) {
		if (fs.existsSync(WorkerServer.applicationVersionDirectory(this.clusterName, application, version))) {
			return this.createInstance(application, version, env, imageId);
		}

		if (!fs.existsSync(WorkerServer.applicationDirectory(this.clusterName, application))) {
			fs.mkdirSync(WorkerServer.applicationDirectory(this.clusterName, application));
			fs.mkdirSync(WorkerServer.applicationVersionsDirecotry(this.clusterName, application));
			fs.mkdirSync(WorkerServer.applicationEnvsDirecotry(this.clusterName, application));
		}

		fs.mkdirSync(WorkerServer.applicationVersionDirectory(this.clusterName, application, version));
		fs.writeFileSync(WorkerServer.applicationVersionImageIdFile(this.clusterName, application, version), imageId);

		return new Promise<void>(async done => {
			this.logger.log("pulling", this.logger.av(application, version), "...");

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
					"cluster-key": key
				}
			});

			res.body.pipe(loadProcess.stdin);

			res.body.on("finish", () => {
				this.logger.log("loading ", this.logger.av(application, version), " image");

				loadProcess.on("exit", async () => {
					this.logger.log("loaded ", this.logger.av(application, version));

					await this.createInstance(application, version, env, imageId);

					done();
				});
			});
		});
	}

	async createInstance(application: string, version: string, env: string, imageId: string) {
		if (!fs.existsSync(WorkerServer.applicationEnvDirecotry(this.clusterName, application, env))) {
			fs.mkdirSync(WorkerServer.applicationEnvDirecotry(this.clusterName, application, env));
			fs.mkdirSync(WorkerServer.applicationEnvInstancesDirecotry(this.clusterName, application, env));
		}

		const oldVersion = fs.existsSync(WorkerServer.applicationEnvVersionFile(this.clusterName, application, env)) && fs.readFileSync(WorkerServer.applicationEnvVersionFile(this.clusterName, application, env)).toString();
		fs.writeFileSync(WorkerServer.applicationEnvVersionFile(this.clusterName, application, env), version);

		await this.start(application, env);

		if (oldVersion) {
			this.logger.log("replaced ", this.logger.aev(application, env, version), " will be stopped...");

			await this.stop(application, env, oldVersion);
		}
	}

	start(application: string, env: string) {
		return this.logger.process(["starting ", this.logger.aev(application, env, version), "..."], finished => new Promise<void>(async done => {
			const version = fs.readFileSync(WorkerServer.applicationEnvVersionFile(this.clusterName, application, env)).toString();
			const imageId = fs.readFileSync(WorkerServer.applicationVersionImageIdFile(this.clusterName, application, version)).toString();

			this.logger.log("starting ", this.logger.aev(application, env, version), "...");

			const id = Crypto.createKey();
			const internalPort = await Crypto.getRandomPort();
			const externalPort = await Crypto.getRandomPort();

			const runProcess = spawn("docker", [
				"run",
				"--env", `PORT=${internalPort}`, // add port env variable
				"--env", `CLUSTER_APPLICATION=${application}`,
				"--env", `CLUSTER_INTERNAL_PORT=${internalPort}`,
				"--env", `CLUSTER_EXTERNAL_PORT=${externalPort}`,
				"--env", `CLUSTER_VERSION=${version}`,
				"--env", `CLUSTER_IMAGE_ID=${imageId}`,
				"--env", `CLUSTER_CONTAINER_ID=${id}`,
				"--env", `CLUSTER_NAME=${this.clusterName}`,
				"--env", `CLUSTER_WORKER_NAME=${this.name}`,
				"--env", `CLUSTER_REGISTRY_HOST=${this.host}`,
				"--env", `CLUSTER_ENV=${env}`,
				"--expose", internalPort.toString(), // export container port to docker interface
				"-p", `${externalPort}:${internalPort}`, // export port from docker interface to network
				"--name", id, // tag container
				"-d", // detatch
				imageId
			], {
				stdio: [
					"ignore",
					process.stdout,
					process.stderr
				]
			});

			runProcess.on("exit", () => {
				fs.mkdirSync(WorkerServer.applicationEnvInstanceDirecotry(this.clusterName, application, env, id));
				fs.writeFileSync(WorkerServer.applicationEnvInstanceVersionFile(this.clusterName, application, env, id), version);
				fs.writeFileSync(WorkerServer.applicationEnvInstanceInternalPortFile(this.clusterName, application, env, id), internalPort.toString());
				fs.writeFileSync(WorkerServer.applicationEnvInstanceExternalPortFile(this.clusterName, application, env, id), externalPort.toString());

				finished("started ", this.logger.aev(application, env, version));

				done();
			});
		}));
	}

	async stop(application: string, env: string, version: string = null) {
		if (!version) {
			version = fs.readFileSync(WorkerServer.applicationEnvVersionFile(this.clusterName, application, env)).toString();
		}

		for (let instance of this.getInstalledApplicationInstances(application, env)) {
			if (fs.readFileSync(WorkerServer.applicationEnvInstanceVersionFile(this.clusterName, application, env, instance)).toString() == version) {
				await this.logger.process(["stopping", this.logger.aev(application, env, version), "..."], finished => new Promise<void>(done => {
					const stopProcess = spawn("docker", [
						"stop",
						instance
					], {
						stdio: [
							"ignore",
							process.stdout,
							process.stderr
						]
					});
		
					stopProcess.on("exit", () => {
						finished("stopped ", this.logger.aev(application, env, version));

						fs.rmSync(WorkerServer.applicationEnvInstanceDirecotry(this.clusterName, application, env, instance), {
							recursive: true,
							force: true
						});
		
						done();
					});
				}));
			}
		}
	}

	getInstalledApplications() {
		return fs.readdirSync(WorkerServer.applicationsDirectory(this.clusterName));
	}

	getInstalledApplicationEnvs(application: string) {
		return fs.readdirSync(WorkerServer.applicationEnvsDirecotry(this.clusterName, application));
	}

	getInstalledApplicationInstances(application: string, env: string) {
		return fs.readdirSync(WorkerServer.applicationEnvInstancesDirecotry(this.clusterName, application, env));
	}

	getInstances() {
		return new Promise<InstanceState[]>(done => {
			let dockerProcessListOutput = "";

			const dockerProcessListProcess = spawn("docker", ["ps", "--format", "{{.Names}}"]);
			dockerProcessListProcess.stdout.on("data", data => {
				dockerProcessListOutput += data;
			});

			dockerProcessListProcess.on("exit", () => {
				const processes: InstanceState[] = [];
				const psResult = dockerProcessListOutput.split("\n").map(s => s.trim());

				for (let application of this.getInstalledApplications()) {
					for (let env of this.getInstalledApplicationEnvs(application)) {
						for (let instance of this.getInstalledApplicationInstances(application, env)) {
							processes.push({
								application,
								env,
								version: fs.readFileSync(WorkerServer.applicationEnvInstanceVersionFile(this.clusterName, application, env, instance)).toString(),
								instanceId: instance,
								internalPort: +fs.readFileSync(WorkerServer.applicationEnvInstanceInternalPortFile(this.clusterName, application, env, instance)).toString(),
								externalPort: +fs.readFileSync(WorkerServer.applicationEnvInstanceExternalPortFile(this.clusterName, application, env, instance)).toString(),
								running: psResult.includes(instance)
							})
						}
					}
				}

				done(processes);
			});
		});
	}
}