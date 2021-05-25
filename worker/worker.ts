import { Cluster } from "../shared/cluster";
import * as fs from "fs";
import { cpuUsage } from "os-utils";
import { spawn } from "child_process";
import { Crypto } from "../shared/crypto";
import { WorkerInstance } from "./instance-state";
import { Logger } from "../log";
import { WorkerPath } from "./paths";
import { StartRequest } from "../registry/messages/start";
import { StopRequest } from "../registry/messages/stop";
import { Request } from "../shared/request";

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

	static async create(host: string, key: string, name: string) {
		const result = await new Request(host, Cluster.api.registry.create.worker)
			.append("key", key)
			.append("name", name)
			.send<{ name, key }>();

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
		try {
			const response = await new Request(this.host, Cluster.api.registry.ping)
				.append("name", this.name)
				.append("key", this.key)
				.append("cpu-usage", this.cpuUsage)
				.append("endpoint", this.endpoint)
				.send<{ start: StartRequest[], stop: StopRequest[] }>();

			for (let request of response.start) {
				this.start(request.application, request.version, request.env, request.instance, request.variables);
			}

			for (let request of response.stop) {
				this.stop(request.instance);
			}
		} catch (error) {
			this.logger.warn("ping failed! ", error.message);
		}
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

			new Request(this.host, Cluster.api.registry.pull)
				.append("application", application)
				.append("version", version)
				.append("key", this.key)
				.append("worker", this.name)
				.pipe(loadProcess.stdin);

			loadProcess.on("exit", async () => {
				finished("loaded ", this.logger.av(application, version));

				done();
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

			variables.PORT = internalPort;
			variables.CLUSTER_APPLICATION = application;
			variables.CLUSTER_INTERNAL_PORT = internalPort;
			variables.CLUSTER_EXTERNAL_PORT = externalPort;
			variables.CLUSTER_VERSION = version;
			variables.CLUSTER_INSTANCE = instance;
			variables.CLUSTER_NAME = this.clusterName;
			variables.CLUSTER_WORKER = this.name;
			variables.CLUSTER_REGISTRY = this.host;
			variables.CLUSTER_ENV = env;

			const variableArguments = [];

			for (let name in variables) {
				variableArguments.push("--env", `${name}=${variables[name]}`);
			}

			const runProcess = spawn("docker", [
				"run",
				...variableArguments,
				"--expose", internalPort.toString(), // export container port to docker interface
				"-p", `${externalPort}:${internalPort}`, // export port from docker interface to network
				"--name", instance, // tag container
				"-d", // detatch (run in background)
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
		await new Request(this.host, Cluster.api.registry.instances.report.stopped)
			.append("instance", instance)
			.append("worker", this.name)
			.append("application", application)
			.append("env", env)
			.append("version", version)
			.append("port", externalPort)
			.send();
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
				fs.unlinkSync(WorkerPath.instanceVariablesFile(this.clusterName, instance));
				
				fs.rmdirSync(WorkerPath.instanceDirectory(this.clusterName, instance));

				await new Request(this.host, Cluster.api.registry.instances.report.stopped)
					.append("instance", instance);

				finished("stopped ", this.logger.i(instance));
	
				done();
			});
		}));
	}

	setLocalPath(hostname: string) {
		fs.writeFileSync(WorkerPath.endpointFile(this.clusterName), hostname);
	}
}