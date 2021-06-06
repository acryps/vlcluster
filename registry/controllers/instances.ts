import { Logger } from "../../shared/log";
import { Cluster } from "../../shared/cluster";
import { Crypto } from "../../shared/crypto";
import { StartRequest } from "../messages/start";
import { StopRequest } from "../messages/stop";
import { RegistryPath } from "../paths";
import { RegistryServer } from "../registry";
import fs = require("fs");
import { ActiveInstance, ActiveWorker } from "../worker";
import { Handler } from "../../shared/handler";

export class InstancesRegistryController {
    logger = new Logger("instances");

	workers: ActiveWorker[] = [];

    startRequests: StartRequest[] = [];
    stopRequests: StopRequest[] = [];

    constructor(private registry: RegistryServer) {}

    register(app) {
        new Handler(app, Cluster.api.registry.instances.report.started, async params => {
            const workerName = params.worker; 
			const instance = params.instance; 
			const env = params.env; 
			const version = params.version; 
			const application = params.application;
			const port = +params.port;

			const worker = this.workers.find(w => w.name == workerName);
            const request = this.startRequests.find(req => req.instance == instance);

            // add instance to running instance list
            const activeInstance = new ActiveInstance();
			activeInstance.application = application;
			activeInstance.version = version;
			activeInstance.env = env;
			activeInstance.id = instance;
			activeInstance.port = port;

			activeInstance.worker = worker;

			worker.instances.push(activeInstance);

            // update gateways to expose application if there was no start request (when a worker reconnects)
            if (!request) {
				this.logger.log(this.logger.aevi(application, env, version, instance), " started on ", this.logger.w(workerName), " exposing ", this.logger.p(port));

                await this.registry.route.updateGateways();

				return {};
			}

			request.oncomplete(request);

            // check if any instance was started as a backup
            // shut down the backup instances of this instance
            for (let worker of this.workers) {
                for (let id of fs.readdirSync(RegistryPath.applicationEnvActiveVersionWorkerDirectory(application, env, version, worker.name))) {
                    const liveInstance = fs.readFileSync(RegistryPath.applicationEnvActiveVersionWorkerInstanceFile(application, env, version, worker.name, id)).toString().split("\n");

                    if (liveInstance[1] == instance) {
                        this.stopInstance(application, version, env, worker.name, liveInstance[0]);
                    }
                }
            }

            this.startRequests.splice(this.startRequests.indexOf(request), 1);

			return {};
        });

        new Handler(app, Cluster.api.registry.instances.report.stopped, async params => {
            const instance = params.instance;
            const request = this.stopRequests.find(i => i.instance == instance);

            if (request) {
                request.oncomplete();
            }

            // remove instance from active instances
            for (let worker of this.workers) {
                for (let activeInstance of [...worker.instances]) {
                    if (activeInstance.id == instance) {
                        worker.instances.splice(worker.instances.indexOf(activeInstance), 1);
                    }
                }
            }

            this.stopRequests.splice(this.stopRequests.indexOf(request), 1);

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
    
            let worker = this.workers.find(s => s.name == name);
            const now = new Date();
    
            let isNewWorker = false;

            if (!worker) {
                // create new active worker
                worker = new ActiveWorker();
                worker.name = name;
                worker.cpuUsage = cpuUsage;
                worker.lastSeen = now;
                worker.endpoint = endpoint;

                this.workers.push(worker);

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
    
            // copy message queue
            const messages = [...worker.pendingMessages];
            worker.pendingMessages = [];

            // timeout check
            setTimeout(() => {
                if (worker.lastSeen == now) {
                    // handle timeout
                    this.logger.warn(this.logger.w(name), " ping timed out");

                    this.workers.splice(this.workers.indexOf(worker), 1);

                    // start backup instances for all instances (don't await!)
                    for (let instance of worker.instances) {
                        this.startBackupFor(instance);
                    }

                    // clear all requests from the down worker
                    this.startRequests = this.startRequests.filter(req => req.worker != worker.name);
                    this.stopRequests = this.stopRequests.filter(req => req.worker != worker.name);

                    // find alternative workers for pending start requests
                    // don't create as backup, because they were never started on the worker
                    for (let message of messages) {
                        if (message instanceof StartRequest) {
                            const request = message;
                            
                            this.logger.warn("proposal ", this.logger.aev(request.application, request.env, request.version), " for ", this.logger.w(worker.name), " timed out");

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
    
            for (let worker of this.workers) {
                for (let instance of worker.instances) {
                    instances.push({
                        instance: instance.id,
                        application: instance.application,
                        version: instance.version,
                        env: instance.env,
                        port: instance.port,
                        worker: worker.name
                    });
                }
            }

            return instances;
        });

        new Handler(app, Cluster.api.registry.instances.restart, async params => {
            const application = params.application;
            const env = params.env;

            for (let worker of this.workers) {
                for (let instance of worker.instances) {
                    let restart = true;

                    if (application && instance.application != application) {
                        restart = false;
                    }

                    if (env && instance.env != env) {
                        restart = false;
                    }

                    if (restart) {
                        await this.start(instance.application, instance.version, instance.env);
                        
                        // we don't need to wait for the instance to stop, this can happen in the background
                        this.stopInstance(instance.application, instance.version, instance.env, instance.worker.name, instance.id);
                    }
                }
            }
        });
    }

    // start backup instance
    // will be stopped as soon as the original instance is started again
    async startBackupFor(instance: ActiveInstance) {
        await this.start(instance.application, instance.version, instance.env, instance.id);
    }

    start(application: string, version: string, env: string, backupOf: string = null) {
		const instance = Crypto.createId(application, version, env);

		return new Promise<StartRequest>(done => {
            // pick worker with the most cpu available
			const worker = this.workers.sort((a, b) => a.cpuUsage - b.cpuUsage)[0];

            // wait for a worker if none are available
			if (!worker) {
				this.logger.warn("out of workers to run ", this.logger.aev(application, env, version), "! retrying...");

				setTimeout(async () => {
					done(await this.start(application, version, env));
				}, Cluster.pingInterval);

				return;
			}

            // create start request
			this.logger.log("requesting start ", this.logger.aevi(application, version, env, instance), " on ", this.logger.w(worker.name));

			const request = new StartRequest();
            request.worker = worker.name;
			request.application = application;
			request.version = version;
			request.env = env;
			request.instance = instance;
			request.variables = this.registry.variables.constructActive(application, env);

			this.startRequests.push(request);

            // wait for request to complete
			request.oncomplete = status => {
                request.port = status.port;

				if (!fs.existsSync(RegistryPath.applicationEnvActiveVersionWorkerDirectory(application, env, version, worker.name))) {
					fs.mkdirSync(RegistryPath.applicationEnvActiveVersionWorkerDirectory(application, env, version, worker.name));
				}

                // write id file, add backup if the instance is a backup of another instance
				fs.writeFileSync(
					RegistryPath.applicationEnvActiveVersionWorkerInstanceFile(application, env, version, worker.name, instance),
					`${instance}${backupOf ? `\n${backupOf}` : ""}`
				);

				this.logger.log("started ", this.logger.aevi(application, version, env, instance), " on ", this.logger.w(worker.name));

                // update gateways
                this.registry.route.updateGateways();

				done(request);
			};

			worker.pendingMessages.push(request);
		});
	}

    async stop(application: string, version: string, env: string) {
		this.logger.log("shutting down ", this.logger.aev(application, version, env));

        const promises = [];

        // stopping all instances
		for (let worker of [...fs.readdirSync(RegistryPath.applicationEnvActiveVersionDirectory(application, env, version))]) {
			for (let instance of [...fs.readdirSync(RegistryPath.applicationEnvActiveVersionWorkerDirectory(application, env, version, worker))]) {
                const name = fs.readFileSync(RegistryPath.applicationEnvActiveVersionWorkerInstanceFile(application, env, version, worker, instance)).toString().split("\n")[0];

				promises.push(this.stopInstance(application, version, env, worker, name));
			}
		}

        // stop all instances in paralel
        await Promise.all(promises);

		this.logger.log("shut down ", this.logger.aev(application, version, env));
	}

	async stopInstance(application: string, version: string, env: string, workerName: string, instance: string) {
		const worker = this.workers.find(w => w.name == workerName);

		if (!worker) {
			this.logger.log("skipping shut down of ", this.logger.wi(workerName, instance), ". worker down");

			return;
		}
		
		await this.logger.log("requesting shutdown ", this.logger.wi(workerName, instance));

		const request = new StopRequest();
        request.worker = workerName;
		request.instance = instance;
		
		this.stopRequests.push(request);
		worker.pendingMessages.push(request);
		
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

                // remove instance from worker
                for (let worker of this.workers) {
                    for (let runningInstance of [...worker.instances]) {
                        if (runningInstance.id == instance) {
                            worker.instances.splice(worker.instances.indexOf(runningInstance), 1);
                        }
                    }
                }

				done();
			};
		});
	}
}