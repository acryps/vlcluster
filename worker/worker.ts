import { Cluster } from "../cluster";
import * as fetch from "node-fetch";
import * as fs from "fs";
import { cpuUsage } from "os-utils";
import { spawn } from "child_process";
import { Crypto } from "../crypto";
import { WorkerInstance } from "./instance-state";
import { Logger } from "../log";
import { WorkerPath } from "./paths";
import { StartRequest } from "../registry/messages/start";
import { StopRequest } from "../registry/messages/stop";

export class WorkerServer {
	key: string;
	name: string;
	host: string;
	endpoint: string;
	cpuUsage: number;

	logger: Logger;

	instances: WorkerInstance[] = [];

	constructor(private clusterName: string) {
		this.logger = new Logger("worker");

		this.key = fs.readFileSync(WorkerPath.keyFile(clusterName)).toString();
		this.host = fs.readFileSync(WorkerPath.hostFile(clusterName)).toString();
		this.name = fs.readFileSync(WorkerPath.nameFile(clusterName)).toString();

		if (fs.existsSync(WorkerPath.endpointFile(clusterName))) {
			this.endpoint = fs.readFileSync(WorkerPath.endpointFile(clusterName)).toString();
		} else {
			this.logger.warn("endpoint missing. worker will not be reachable from gateways. set endpoint by running 'vlcluster init endpoint'");
		}

		if (!fs.existsSync(WorkerPath.instancesDirectory(this.clusterName))) {
			fs.mkdirSync(WorkerPath.instancesDirectory(this.clusterName));
		}

		this.cpuUsage = 1;
	}

	async register() {
		this.startCPUMonitoring();
		
		await this.startPing();
		await this.startInstances();
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

	async startInstances() {
		for (let instance of fs.readdirSync(WorkerPath.instancesDirectory(this.clusterName))) {
			await this.start(
				fs.readFileSync(WorkerPath.instanceApplicationFile(this.clusterName, instance)).toString(),
				fs.readFileSync(WorkerPath.instanceVersionFile(this.clusterName, instance)).toString(),
				fs.readFileSync(WorkerPath.instanceEnvFile(this.clusterName, instance)).toString(),
				instance,
				JSON.parse(fs.readFileSync(WorkerPath.instanceVariablesFile(this.clusterName, instance)).toString())
			);
		}
	}

	async startPing() {
		await this.ping();

		setInterval(() => {
			this.ping();
		}, Cluster.pingInterval);
	}

	async ping() {
		await fetch(`http://${this.host}:${Cluster.port}${Cluster.api.registry.ping}`, {
			method: "POST", 
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				name: this.name,
				key: this.key,
				cpuUsage: this.cpuUsage,
				endpoint: this.endpoint
			})
		}).then(res => res.json()).then(res => {
			for (let request of res.start as StartRequest[]) {
				this.start(request.application, request.version, request.env, request.instance, request.variables);
			}

			for (let request of res.stop as StopRequest[]) {
				this.stop(request.instance);
			}
		}).catch(error => {
			this.logger.log("ping failed! ", error.message);
		});
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
					"ignore",
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

	async start(application: string, version: string, env: string, instance: string, variables: any) {
		const state = new WorkerInstance();
		state.application = application;
		state.version = version;
		state.env = env;
		state.instanceId = instance;
		state.running = false;

		this.instances.push(state);
		
		if (!(await this.hasLoadedImage(application, version))) {
			await this.pull(application, version);
		}

		// skip start if instance is already running
		if (await this.isInstanceRunning(instance)) {
			state.externalPort = await this.getExternalPort(instance);
			state.running = true;

			await this.reportInstanceStart(application, version, env, instance, state.externalPort);

			this.logger.log(this.logger.aevi(application, env, version, instance), " already running");

			return;
		}

		// remove old container if present
		if (await this.isInstanceContainerLoaded(instance)) {
			await this.removeInstanceContainer(instance);
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
				...Object.keys(variables).map(name => [
					"--env", `${name}=${variables[name]}`
				]).flat(),
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

				if (!fs.existsSync(WorkerPath.instanceDirectory(this.clusterName, instance))) {
					fs.mkdirSync(WorkerPath.instanceDirectory(this.clusterName, instance));
					fs.writeFileSync(WorkerPath.instanceApplicationFile(this.clusterName, instance), application);
					fs.writeFileSync(WorkerPath.instanceVersionFile(this.clusterName, instance), version);
					fs.writeFileSync(WorkerPath.instanceEnvFile(this.clusterName, instance), env);
					fs.writeFileSync(WorkerPath.instanceVariablesFile(this.clusterName, instance), JSON.stringify(variables));
				}
				
				this.logger.process(["reporting start ", this.logger.aev(application, env, version), " to registry"], async finished => {
					await this.reportInstanceStart(application, version, env, instance, externalPort);

					finished("start ", this.logger.aev(application, env, version), " reported");

					state.externalPort = externalPort;
					state.internalPort = internalPort;

					state.running = true;

					done();
				});
			});
		}));
	}

	async reportInstanceStart(application: string, version: string, env: string, instance: string, externalPort: number) {
		await fetch(`http://${this.host}:${Cluster.port}${Cluster.api.registry.startedApplication}`, {
			method: "POST",
			headers: {
				"cluster-instance": instance,
				"cluster-worker": this.name,
				"cluster-application": application,
				"cluster-env": env,
				"cluster-verison": version,
				"cluster-port": externalPort
			}
		}).then(r => r.json());
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

	isInstanceRunning(instance: string) {
		return new Promise<boolean>(done => {
			const process = spawn("docker", [
				"ps", 
				`--format={{.Names}}`
			]);

			let output = "";

			process.stdout.on("data", data => {
				output += data;
			});

			process.on("exit", () => {
				done(output.split("\n").includes(instance));
			});
		});
	}

	isInstanceContainerLoaded(instance: string) {
		return new Promise<boolean>(done => {
			const process = spawn("docker", [
				"ps",
				"-a", // include stopped/exited containers
				`--format={{.Names}}`
			]);

			let output = "";

			process.stdout.on("data", data => {
				output += data;
			});

			process.on("exit", () => {
				done(output.split("\n").includes(instance));
			});
		});
	}

	getExternalPort(instance: string) {
		return new Promise<number>(done => {
			const process = spawn("docker", [
				"port",
				instance
			]);

			let output = "";

			process.stdout.on("data", data => {
				output += data;
			});

			process.on("exit", () => {
				done(+output.split(":").pop().trim());
			});
		});
	}

	removeInstanceContainer(instance: string) {
		return new Promise<void>(done => {
			const stopProcess = spawn("docker", [
				"rm",
				instance
			], {
				stdio: "ignore"
			});
			
			stopProcess.on("exit", () => {
				done();
			});
		});
	}

	async stop(instance: string) {
		await this.logger.process(["stopping ", this.logger.i(instance)], finished => new Promise<void>(done => {
			const stopProcess = spawn("docker", [
				"rm", // remove container
				"--force", // stop container
				instance
			], {
				stdio: "ignore"
			});
			
			stopProcess.on("exit", async () => {
				// remove instance files
				fs.unlinkSync(WorkerPath.instanceEnvFile(this.clusterName, instance));
				fs.unlinkSync(WorkerPath.instanceApplicationFile(this.clusterName, instance));
				fs.unlinkSync(WorkerPath.instanceVersionFile(this.clusterName, instance));
				
				fs.rmdirSync(WorkerPath.instanceDirectory(this.clusterName, instance));

				await fetch(`http://${this.host}:${Cluster.port}${Cluster.api.registry.stoppedApplication}`, {
					method: "POST",
					headers: {
						"cluster-instance": instance
					}
				}).then(r => r.json());

				finished("stopped ", this.logger.i(instance));
	
				done();
			});
		}));
	}

	setLocalPath(hostname: string) {
		fs.writeFileSync(WorkerPath.endpointFile(this.clusterName), hostname);
	}
}