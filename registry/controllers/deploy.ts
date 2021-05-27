import { Logger } from "../../shared/log";
import { Cluster } from "../../shared/cluster";
import { Handler } from "../../shared/handler";
import { RegistryServer } from "../registry";

import fs = require("fs");
import { RegistryPath } from "../paths";
import { StartRequest } from "../messages/start";
import { StopRequest } from "../messages/stop";
import { Crypto } from "../../shared/crypto";

export class DeployRegistryController {
    logger = new Logger("deploy");

    constructor(private registry: RegistryServer) {}

    register(app) {
        new Handler(app, Cluster.api.registry.push, async (params, req) => {
            const application = params.application;
			const version = params.version;
			const imageName = params["image-name"];

            if (!application) {
                throw new Error("no application name");
            }

            if (!version) {
                throw new Error("no version");
            }

            this.logger.log("create ", this.logger.av(application, version));

            if (!fs.existsSync(RegistryPath.applicationDirectory(application))) {
                this.logger.log(`create new application '${application}'`);
    
                fs.mkdirSync(RegistryPath.applicationDirectory(application));
                fs.mkdirSync(RegistryPath.applicationVersionsDirectory(application));
                fs.mkdirSync(RegistryPath.applicationEnvsDirectory(application));
            }

            if (fs.existsSync(RegistryPath.applicationVersionDirectory(application, version))) {
                throw new Error(`version '${version}' of application '${application}' already exists!`);
            }

            fs.mkdirSync(RegistryPath.applicationVersionDirectory(application, version));
            fs.writeFileSync(RegistryPath.applicationVersionImageIdFile(application, version), imageName);

            this.logger.log("receiving ", this.logger.av(application, version), " image...");
            req.pipe(fs.createWriteStream(RegistryPath.applicationVersionImageSourceFile(application, version)));

            return await new Promise(done => {
				req.on("end", () => {
					this.logger.log("saved ", this.logger.av(application, version), " image");

					done({});
				});
            });
        });

        new Handler(app, Cluster.api.registry.upgrade, async params => {
            const application = params.application;
            const version = params.version;
            const env = params.env;

            if (!fs.existsSync(RegistryPath.applicationVersionDirectory(application, version))) {
                throw new Error("application or version does not exist!");
            }

            this.logger.log("upgrading to ", this.logger.av(application, version));

            return await this.upgrade(application, version, env);
        });

        // use native route to return streamed body
        app.post(Cluster.api.registry.pull, (req, res) => {
			const application = req.headers["cluster-application"];
			const version = req.headers["cluster-version"];
			const key = req.headers["cluster-key"];
			const worker = req.headers["cluster-worker"];
			
			if (!fs.existsSync(RegistryPath.workerDirectory(worker))) {
				throw new Error("worker does not exist");
			}

			if (fs.readFileSync(RegistryPath.workerKeyFile(worker)).toString() != key) {
				throw new Error("invalid key");
			}

			if (!fs.existsSync(RegistryPath.applicationDirectory(application))) {
				throw new Error("application does not exist");
			}

			if (!fs.existsSync(RegistryPath.applicationVersionDirectory(application, version))) {
				throw new Error("application does not exist");
			}

			this.logger.log("sending ", this.logger.av(application, version), " to ", this.logger.w(worker));
			
			fs.createReadStream(RegistryPath.applicationVersionImageSourceFile(application, version)).pipe(res).on("end", () => {
				this.logger.log("sent ", this.logger.av(application, version), " to ", this.logger.w(worker));

                res.json({
                    data: {}
                });
			});
		});
    }

    async upgrade(application: string, version: string, env: string) {
		this.logger.log("upgrade ", this.logger.aev(application, env, version));
		
		let isNewEnv;
		
		if (!fs.existsSync(RegistryPath.applicationEnvDirectory(application, env))) {
			fs.mkdirSync(RegistryPath.applicationEnvDirectory(application, env));
			fs.mkdirSync(RegistryPath.applicationEnvActiveVersionsDirectory(application, env));

			this.logger.log("new env ", this.logger.ae(application, env));
			
			isNewEnv = true;
		}

		if (fs.existsSync(RegistryPath.applicationEnvDangelingVersionFile(application, env))) {
			throw new Error("cannot upgrade. upgrade already in progress!");
		}

		let dangelingVersion;
		
		if (fs.existsSync(RegistryPath.applicationEnvLatestVersionFile(application, env))) {
			dangelingVersion = fs.readFileSync(RegistryPath.applicationEnvLatestVersionFile(application, env)).toString();

			fs.writeFileSync(RegistryPath.applicationEnvDangelingVersionFile(application, env), dangelingVersion);
		} 

		fs.mkdirSync(RegistryPath.applicationEnvActiveVersionDirectory(application, env, version));

		// install application on new worker
		await this.registry.instances.start(application, version, env);

		// write current version file
		fs.writeFileSync(RegistryPath.applicationEnvLatestVersionFile(application, env), version);

		// wait for gateway upgrades
		this.registry.map.updateGateways();
		
		// stop dangeling versions
		if (dangelingVersion) {
			this.registry.instances.stop(application, dangelingVersion, env);

			fs.unlinkSync(RegistryPath.applicationEnvDangelingVersionFile(application, env));
		}
		
		return isNewEnv;
	}
}