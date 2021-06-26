import { Cluster } from "../shared/cluster";
import * as fs from "fs";
import { cpuUsage } from "os-utils";
import { spawn } from "child_process";
import { Crypto } from "../shared/crypto";
import { WorkerInstance } from "./instance-state";
import { Logger } from "../shared/log";
import { Request } from "../shared/request";
import { WorkerConfiguration } from "./configuration";
import { Configuration } from "../shared/configuration";
import { Handler } from "../shared/handler";

export class WorkerServer {
	cpuUsage: number;

	logger: Logger;

	instances: WorkerInstance[] = [];

	constructor(private configuration: WorkerConfiguration) {
		this.logger = new Logger("worker");
		this.cpuUsage = 1;
	}

	async register(app) {
		this.startCPUMonitoring();
		
		await this.startPing();

		new Handler(app, Cluster.api.worker.start, async params => {
			const instance = params.instance;
			const application = params.application;
            const version = params.version;
			const env = params.env;
			const variables = JSON.parse(params.variables);

			const state = await this.start(application, version, env, instance, variables);

			return {
				port: state.externalPort
			};
		});

		new Handler(app, Cluster.api.worker.stop, async params => {
			const instance = params.instance;

			this.stop(instance);
		});
	}

	static async create(host: string, key: string, name: string, endpoint: string) {
		const result = await new Request(host, Cluster.api.registry.create.worker)
			.append("key", key)
			.append("name", name)
			.append("endpoint", endpoint)
			.send<{ name, key }>();

		const configuration: WorkerConfiguration = {
			name,
			clusterName: result.name,
			clusterHost: host,
			key: result.key,
			endpoint
		};

		Configuration.workers.push(configuration);
		Configuration.save();

		return {
			name: result.name
		};
	}

	async startPing() {
		await this.ping();

		setInterval(() => {
			this.ping();
		}, Cluster.pingInterval);
	}

	async ping() {
		try {
			await new Request(this.configuration.clusterHost, Cluster.api.registry.ping)
				.append("name", this.configuration.name)
				.append("key", this.configuration.key)
				.append("cpu-usage", this.cpuUsage)
				.send();
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

			new Request(this.configuration.clusterHost, Cluster.api.registry.pull)
				.append("application", application)
				.append("version", version)
				.append("key", this.configuration.key)
				.append("worker", this.configuration.name)
				.pipe(loadProcess.stdin);

			loadProcess.on("exit", async () => {
				finished("loaded ", this.logger.av(application, version));

				done();
			});
		}));
	}

	async start(application: string, version: string, env: string, instance: string, variables: any): Promise<WorkerInstance> {
		const state = new WorkerInstance();
		state.application = application;
		state.version = version;
		state.env = env;
		state.instanceId = instance;
		state.running = false;
		
		if (!(await this.hasLoadedImage(application, version))) {
			await this.pull(application, version);
		}

		// skip start if instance is already running
		if (await this.isInstanceRunning(instance)) {
			state.externalPort = await this.getExternalPort(instance);
			state.running = true;

			this.logger.log(this.logger.aevi(application, env, version, instance), " already running");
			this.instances.push(state);

			return state;
		}

		// remove old container if present
		if (await this.isInstanceContainerLoaded(instance)) {
			await this.removeInstanceContainer(instance);
		}

		this.logger.log("starting ", this.logger.aev(application, env, version));
			
		const internalPort = await Crypto.getRandomPort();
		const externalPort = await Crypto.getRandomPort();

		this.instances.push(state);

		variables.PORT = internalPort;
		variables.CLUSTER_APPLICATION = application;
		variables.CLUSTER_INTERNAL_PORT = internalPort;
		variables.CLUSTER_EXTERNAL_PORT = externalPort;
		variables.CLUSTER_VERSION = version;
		variables.CLUSTER_INSTANCE = instance;
		variables.CLUSTER_NAME = this.configuration.clusterName;
		variables.CLUSTER_REGISTRY = this.configuration.clusterHost;
		variables.CLUSTER_WORKER = this.configuration.name;
		variables.CLUSTER_WORKER_ENDPOINT = this.configuration.endpoint;
		variables.CLUSTER_ENV = env;

		const variableArguments = [];

		for (let variable in variables) {
			variableArguments.push("--env", `${variable}=${variables[variable]}`);
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

		await new Promise(done => {
			runProcess.on("exit", async () => {
				this.logger.log("started ", this.logger.aevi(application, env, version, instance));

				state.externalPort = externalPort;
				state.internalPort = internalPort;

				state.running = true;

				done(null);
			});
		});

		return state;
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
		this.logger.log("stopping ", this.logger.i(instance));

		const stopProcess = spawn("docker", [
			"rm", // remove container
			"--force", // stop container
			instance
		], {
			stdio: "ignore"
		});
			
		await new Promise(done => {
			stopProcess.on("exit", async () => {
				// remove instance files
				this.logger.log("stopped ", this.logger.i(instance));
	
				done(null);
			});
		});
	}
}