import fs = require("fs");

import { Logger } from "../../shared/log";
import { Cluster } from "../../shared/cluster";
import { Handler } from "../../shared/handler";
import { RegistryServer } from "../registry";
import { Configuration } from "../../shared/configuration";
import { Version } from "../../shared/models/version";
import { Application } from "../../shared/models/application";
import { Environnement } from "../../shared/models/environnement";

export class DeployRegistryController {
    logger = new Logger("deploy");

    constructor(private registry: RegistryServer) {}

    register(app) {
        new Handler(app, Cluster.api.registry.push, async (params, req) => {
            const applicationName = params.application;
			const versionName = params.version;
			const imageName = params["image-name"];

            this.logger.log("push ", this.logger.av(applicationName, versionName));

			let application = this.registry.configuration.applications.find(a => a.name == applicationName);

			if (!application) {
				application = {
					name: applicationName,
					versions: [],
					environnements: [],
					instances: []
				};

				this.logger.log("new application ", this.logger.a(applicationName));

				this.registry.configuration.applications.push(application);
				Configuration.save();
			}

			if (application.versions.find(v => v.name == versionName)) {
				throw new Error(`version '${versionName}' of application '${application}' already exists!`);
			}

			const version: Version = {
				name: versionName,
				pushedAt: new Date()
			};

            this.logger.log("receiving ", this.logger.av(applicationName, versionName), " image...");
            req.pipe(fs.createWriteStream(RegistryServer.imageLocation(applicationName, versionName)));

            return await new Promise(done => {
				req.on("end", () => {
					this.logger.log("saved ", this.logger.av(applicationName, versionName), " image");

					application.versions.push(version);
					Configuration.save();

					done({});
				});
            });
        });

        new Handler(app, Cluster.api.registry.upgrade, async params => {
            const applicationName = params.application;
            const versionName = params.version;
            const envName = params.env;
			const instances = params.instances || 1;

			const application = this.registry.configuration.applications.find(a => a.name == applicationName);
			const version = application.versions.find(v => v.name == versionName);

            if (!application || !version) {
                throw new Error("application or version does not exist!");
            }

			let env = application.environnements.find(e => e.name == envName);

			if (!env) {
				this.logger.log("new env ", this.logger.ae(applicationName, envName));

				env = {
					name: envName,
					routes: []
				};

				application.environnements.push(env);
				Configuration.save();
			}

            this.logger.log("upgrading to ", this.logger.av(applicationName, versionName));

            await this.upgrade(application, version, env, instances);
        });

        // use native route to return streamed body
        app.post(Cluster.api.registry.pull, (req, res) => {
			const applicationName = req.headers["cluster-application"];
			const versionName = req.headers["cluster-version"];
			const key = req.headers["cluster-key"];
			const workerName = req.headers["cluster-worker"];
			
			const worker = this.registry.configuration.workers.find(w => w.name == workerName);

			if (!worker) {
				throw new Error("worker does not exist!");
			} 

			if (worker.key != key) {
				throw new Error("invalid key");
			}

			const application = this.registry.configuration.applications.find(a => a.name == applicationName);

			if (!application) {
				throw new Error("application does not exist");
			}

			if (!application.versions.find(v => v.name == versionName)) {
				throw new Error("application does not exist");
			}

			this.logger.log("sending ", this.logger.av(applicationName, versionName), " to ", this.logger.w(worker.name));
			
			fs.createReadStream(RegistryServer.imageLocation(applicationName, versionName)).pipe(res).on("end", () => {
				this.logger.log("sent ", this.logger.av(applicationName, versionName), " to ", this.logger.w(worker.name));

                res.json({
                    data: {}
                });
			});
		});
    }

    async upgrade(application: Application, version: Version, env: Environnement, instances: number) {
		this.logger.log("upgrade ", this.logger.aev(application.name, env.name, version.name));

		const oldVersion = env.latestVersion;

		// install applications on new worker
		for (let i = 0; i < instances; i++) {
			// the gateways will automatically be reloaded whenever an application starts
			await this.registry.instances.start(application, version, env);
		}

		// write current version file
		env.latestVersion = version;
		Configuration.save();

		// update gateways
		await this.registry.route.updateGateways();
		
		// stop dangeling versions
		if (oldVersion) {
			// no version will stop all containers running older versions
			this.registry.instances.stop(application, null, env);
		}
	}
}