import fs = require("fs");

import { Logger } from "../../shared/log";
import { Cluster } from "../../shared/cluster";
import { Crypto } from "../../shared/crypto";
import { RegistryServer } from "../registry";
import { Handler } from "../../shared/handler";
import { Application } from "../../shared/models/application";
import { Version } from "../../shared/models/version";
import { Environnement } from "../../shared/models/environnement";
import { Instance } from "../../shared/models/instance";
import { Request } from "../../shared/request";
import { Configuration } from "../../shared/configuration";

export class InstancesRegistryController {
    logger = new Logger("instances");

    constructor(private registry: RegistryServer) {}

    register(app) {
        new Handler(app, Cluster.api.registry.ping, async params => {
            const name = params.name;
            const key = params.key;
            const cpuUsage = params["cpu-usage"];

            const worker = this.registry.configuration.workers.find(w => w.name == name);
    
            if (key != worker.key) {
                throw new Error("invalid key!");
            }
    
            const now = new Date();

            if (!worker.running) {
                this.logger.log("worker login ", this.logger.w(name), " on ", worker.endpoint);

                // restart applications that were supposed to run on this instance 
                // kill backups after that
                for (let application of this.registry.configuration.applications) {
                    for (let instance of application.instances) {
                        if (instance.worker == worker && !instance.running) {
                            this.start(application, instance.version, instance.env).then(() => {
                                for (let backupInstance of application.instances) {
                                    if (backupInstance.backupOf == instance) {
                                        this.stopInstance(application, backupInstance.version, backupInstance.env, backupInstance);
                                    }
                                }
                            });
                        }
                    }
                }
            }

            worker.running = true;
            worker.cpuUsage = cpuUsage;
            worker.lastSeen = now;
    
            // timeout check
            setTimeout(() => {
                if (worker.lastSeen == now) {
                    // handle timeout
                    this.logger.warn(this.logger.w(name), " ping timed out");

                    worker.running = false;

                    // start backup instances for all instances (don't await!)
                    for (let application of this.registry.configuration.applications) {
                        for (let instance of application.instances) {
                            if (instance.worker == worker) {
                                instance.running = false;

                                this.startBackupFor(application, instance);
                            }
                        }
                    }
                }
            }, Cluster.pingTimeout);
        });

        new Handler(app, Cluster.api.registry.instances.list, async params => {
            const instances = [];
    
            for (let application of this.registry.configuration.applications) {
                for (let instance of application.instances) {
                    instances.push({
                        instance: instance.name,
                        application: application.name,
                        version: instance.version.name,
                        env: instance.env.name,
                        port: instance.port,
                        worker: instance.worker.name,
                        backup: instance.backupOf?.name
                    });
                }
            }

            return instances;
        });

        new Handler(app, Cluster.api.registry.instances.restart, async params => {
            const applicationName = params.application;
            const envName = params.env;

            let count = 0;

            for (let application of this.registry.configuration.applications) {
                if (!applicationName || application.name == applicationName) {
                    for (let instance of [...application.instances]) {
                        if (!envName || instance.env.name == envName) {
                            if (instance.running) {
                                // start new instance
                                await this.start(application, instance.version, instance.env);
                        
                                // stop instance
                                await this.stopInstance(application, instance.version, instance.env, instance);

                                count++;
                            }
                        }
                    }
                }
            }

            // update gateways
            await this.registry.route.updateGateways();

            return count;
        });
    }

    // pick worker with the most cpu available
    pickWorker() {
        return this.registry.configuration.workers.filter(w => w.running).sort((a, b) => a.cpuUsage - b.cpuUsage)[0];
    }

    // start backup instance
    // will be stopped as soon as the original instance is started again
    async startBackupFor(application: Application, instance: Instance) {
		await this.start(application, instance.version, instance.env, null, instance);
		
		// update gateways
		await this.registry.route.updateGateways();
    }

    // start instance
    // set source if you want to update the instance object instead of creating a new instance object
    // set backupOf if you want the instance to automatically close when the original worker goes back online
    async start(application: Application, version: Version, env: Environnement, source: Instance = null, backupOf: Instance = null) {
		const worker = this.pickWorker();

        // wait for a worker if none are available
        if (!worker) {
            this.logger.warn("out of workers to run ", this.logger.aev(application.name, env.name, version.name), "! retrying...");

            await new Promise(done => setTimeout(() => done(null), Cluster.startRetryTimeout));

            return await this.start(application, version, env, source, backupOf);
        }

        let instance: Instance;
        
        if (source) {
            source.running = false;
            source.worker = worker;
            source.port = null;

            instance = source;
        } else {
            instance = {
                name: Crypto.createId(application.name, version.name, env.name),
                version,
                env,
                worker,
                backupOf,
                running: false
            };
    
            application.instances.push(instance);
            Configuration.save();
        }

        this.logger.log("requesting start ", this.logger.aevi(application.name, env.name, version.name, instance.name), " on ", this.logger.w(worker.name));

        try {
            const startRequest = await new Request(worker.endpoint, Cluster.api.worker.start)
                .append("instance", instance.name)
                .append("application", application.name)
                .append("version", version.name)
                .append("env", env.name)
                .append("variables", JSON.stringify(this.registry.variables.constructActive(application, env)))
                .send<{
                    port: number
                }>();

            instance.port = startRequest.port;
            instance.running = true;

            Configuration.save();
        } catch (error) {
            this.logger.warn("start of ", this.logger.aevi(application.name, env.name, version.name, instance.name), " on ", this.logger.w(worker.name), " failed! ", error);
            
            Configuration.save();

            await new Promise(done => setTimeout(() => done(null), Cluster.startRetryTimeout));

            return await this.start(application, version, env, instance, backupOf);
        }
	}

    // stop all instances of ave
    // all outdated version instances will be stopped if version is null
    async stop(application: Application, version: Version | null, env: Environnement) {
		this.logger.log("shutting down ", this.logger.aev(application.name, version.name, env.name));

        const promises = [];

        for (let instance of application.instances) {
            if (version ? instance.version == version : instance.version != env.latestVersion) {
                promises.push(this.stopInstance(application, version, env, instance));
            }
        }

        await Promise.all(promises);

		this.logger.log("shut down ", this.logger.aev(application.name, version.name, env.name));
	}

    // stop single instance
	async stopInstance(application: Application, version: Version, env: Environnement, instance: Instance) {
        const worker = instance.worker;

		await this.logger.log("requesting shutdown ", this.logger.aevi(application.name, env.name, version.name, instance.name), " on ", this.logger.w(worker.name));

        try {
            await new Request(worker.endpoint, Cluster.api.worker.stop)
                .append("instance", instance.name)
                .send();

            application.instances.splice(application.instances.indexOf(instance), 1);
            Configuration.save();
        } catch (error) {
            this.logger.warn("could not stop ", this.logger.aevi(application.name, env.name, version.name, instance.name), " on ", this.logger.w(worker.name));
        }
	}
}