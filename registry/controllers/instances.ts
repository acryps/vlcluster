import { Logger } from "../../shared/log";
import { Cluster } from "../../shared/cluster";
import { Crypto } from "../../shared/crypto";
import { StartRequest } from "../messages/start";
import { StopRequest } from "../messages/stop";
import { RegistryPath } from "../paths";
import { RegistryServer } from "../registry";
import fs = require("fs");
import { ChildInstance, ChildWorker } from "../worker";
import { Handler } from "../../shared/handler";

export class InstancesRegistryController {
    logger = new Logger("instances");

	runningWorkers: ChildWorker[] = [];
    
    pendingStartRequests: StartRequest[] = [];
	pendingStopRequests: StopRequest[] = [];

    constructor(private registry: RegistryServer) {}

    register(app) {
        new Handler(app, Cluster.api.registry.instances.report.started, async params => {
            const workerName = params.worker; 
			const instance = params.instance; 
			const env = params.env; 
			const version = params.version; 
			const application = params.application;
			const port = +params.port;

            const request = this.pendingStartRequests.find(i => i.instance == instance);
			const worker = this.runningWorkers.find(w => w.name == workerName);

            const state = new ChildInstance();
			state.application = application;
			state.version = version;
			state.env = env;
			state.id = instance;
			state.port = port;

			state.worker = worker;

			worker.instances[instance] = state;

            if (!request) {
				this.logger.log(this.logger.aevi(application, env, version, instance), " started on ", this.logger.w(workerName), " exposing ", this.logger.p(port));

				await this.registry.route.updateGateways();

				return {};
			}

			request.oncomplete(request);

			return {};
        });

        new Handler(app, Cluster.api.registry.instances.report.stopped, async params => {
            const instance = params.instance;
            const request = this.pendingStopRequests.find(i => i.instance == instance);

            if (request) {
                request.oncomplete();
            }

            return {};
        });

        new Handler(app, Cluster.api.registry.ping, async params => {
            const name = params.name;
            const key = params.key;
            const cpuUsage = params["cpu-usage"];
            const endpoint = params.endpoint;
    
            if (!name) {
                throw new Error("no name!");
            }
    
            if (key != fs.readFileSync(RegistryPath.workerKeyFile(name)).toString()) {
                throw new Error("invalid key!");
            }
    
            let worker = this.runningWorkers.find(s => s.name == name);
            const now = new Date();
    
            let isNewWorker = false;

            if (!worker) {
                worker = new ChildWorker();
                worker.name = name;
                worker.cpuUsage = cpuUsage;
                worker.lastSeen = now;
                worker.endpoint = endpoint;

                this.runningWorkers.push(worker);

                if (endpoint) {
                    this.logger.log("worker login ", this.logger.w(name), " on ", endpoint);
                } else {
                    this.logger.log("worker login ", this.logger.w(name));
                } 

                isNewWorker = true;
            } else {
                worker.cpuUsage = cpuUsage;
                worker.lastSeen = now;
                worker.endpoint = endpoint;
            }
    
            const messages = [...worker.messageQueue];
            worker.messageQueue = [];

            // timeout check
            setTimeout(() => {
                if (worker.lastSeen == now) {
                    this.logger.log(this.logger.w(name), " ping timed out");

                    this.runningWorkers.splice(this.runningWorkers.indexOf(worker), 1);

                    for (let id in worker.instances) {
                        const instance = worker.instances[id];

                        this.start(instance.application, instance.version, instance.env);
                    }

                    for (let message of messages) {
                        if (message instanceof StartRequest) {
                            const request = message;
                            
                            this.logger.log("proposal ", this.logger.aev(request.application, request.env, request.version), " for ", this.logger.w(worker.name), " timed out");

                            this.start(request.application, request.version, request.env).then(() => {
                                request.oncomplete(request);
                            });
                        }
                    }
                }
            }, Cluster.pingTimeout);

            return {
                new: isNewWorker,
                start: messages.filter(m => m instanceof StartRequest),
                stop: messages.filter(m => m instanceof StopRequest)
            };
        });

        new Handler(app, Cluster.api.registry.instances.list, async params => {
            const instances = [];
    
            for (let worker of this.runningWorkers) {
                for (let id in worker.instances) {
                    const instance = worker.instances[id];

                    instances.push({
                        instance: id,
                        application: instance.application,
                        version: instance.version,
                        env: instance.env,
                        port: instance.port
                    });
                }
            }

            return instances;
        });

        new Handler(app, Cluster.api.registry.instances.restart, async params => {
            const application = params.application;
            const env = params.env;

            for (let worker of this.runningWorkers) {
                for (let id in worker.instances) {
                    const instance = worker.instances[id];
                    let restart = true;

                    if (application && instance.application != application) {
                        restart = false;
                    }

                    if (env && instance.env != env) {
                        restart = false;
                    }

                    if (restart) {
                        await this.start(instance.application, instance.version, instance.env);
                        await this.stopInstance(instance.application, instance.version, instance.env, instance.worker.name, instance.id);
                    }
                }
            }
        });
    }

    start(application: string, version: string, env: string) {
		const instance = Crypto.createId(application, version, env);

		return new Promise<StartRequest>(done => {
			const worker = this.runningWorkers.sort((a, b) => a.cpuUsage - b.cpuUsage)[0];

			if (!worker) {
				this.logger.log("out of workers to run ", this.logger.aev(application, env, version), "! retrying...");

				setTimeout(async () => {
					done(await this.start(application, version, env));
				}, Cluster.pingInterval);

				return;
			}

			this.logger.log("requesting start ", this.logger.aevi(application, version, env, instance), " on ", this.logger.w(worker.name));

			const request = new StartRequest();
			request.application = application;
			request.version = version;
			request.env = env;
			request.instance = instance;
			request.variables = this.registry.variables.constructActive(application, env);

			this.pendingStartRequests.push(request);

			request.oncomplete = status => {
				request.port = status.port;

				if (!fs.existsSync(RegistryPath.applicationEnvActiveVersionWorkerDirectory(application, env, version, worker.name))) {
					fs.mkdirSync(RegistryPath.applicationEnvActiveVersionWorkerDirectory(application, env, version, worker.name));
				}

				fs.writeFileSync(
					RegistryPath.applicationEnvActiveVersionWorkerInstanceFile(application, env, version, worker.name, instance),
					instance
				);

				this.logger.log("started ", this.logger.aevi(application, version, env, instance), " on ", this.logger.w(worker.name));

				done(request);
			};

			worker.messageQueue.push(request);
		});
	}

    async stop(application: string, version: string, env: string) {
		this.logger.log("shutting down ", this.logger.aev(application, version, env));

		for (let worker of [...fs.readdirSync(RegistryPath.applicationEnvActiveVersionDirectory(application, env, version))]) {
			for (let instance of [...fs.readdirSync(RegistryPath.applicationEnvActiveVersionWorkerDirectory(application, env, version, worker))]) {
                const name = fs.readFileSync(RegistryPath.applicationEnvActiveVersionWorkerInstanceFile(application, env, version, worker, instance)).toString();

				await this.stopInstance(application, version, env, worker, name);
			}
		}

		this.logger.log("shut down ", this.logger.aev(application, version, env));
	}

	async stopInstance(application: string, version: string, env: string, workerName: string, instance: string) {
		const worker = this.runningWorkers.find(w => w.name == workerName);

		if (!worker) {
			this.logger.log("skipping shut down of ", this.logger.wi(workerName, instance), ". worker down");

			return;
		}
		
		await this.logger.log("requesting shutdown ", this.logger.wi(workerName, instance));

		const request = new StopRequest();
		request.instance = instance;
		
		this.pendingStopRequests.push(request);
		worker.messageQueue.push(request);
		
		await new Promise<void>(done => {
			request.oncomplete = () => {
				// remove instance file
				fs.unlinkSync(RegistryPath.applicationEnvActiveVersionWorkerInstanceFile(application, env, version, worker.name, instance));

				// remove worker directory if no other instances are running
				if (!fs.readdirSync(RegistryPath.applicationEnvActiveVersionWorkerDirectory(application, env, version, worker.name)).length) {
					fs.rmdirSync(RegistryPath.applicationEnvActiveVersionWorkerDirectory(application, env, version, worker.name));
				}

				// remove version directory if no other instances are running
				if (!fs.readdirSync(RegistryPath.applicationEnvActiveVersionDirectory(application, env, version)).length) {
					fs.rmdirSync(RegistryPath.applicationEnvActiveVersionDirectory(application, env, version));
				}

				this.logger.log("stopped ", this.logger.wi(workerName, instance));

                for (let worker of this.runningWorkers) {
                    for (let runningInstance in worker.instances) {
                        if (runningInstance == instance) {
                            delete worker.instances[instance];
                        }
                    }
                }

				done();
			};
		});
	}
}