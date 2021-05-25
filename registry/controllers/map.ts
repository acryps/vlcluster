import { Logger } from "../../log";
import { RegistryServer } from "../registry";
import fs = require("fs");
import { Crypto } from "../../shared/crypto";
import { RegistryPath } from "../paths";
import { Handler } from "../../shared/handler";
import { Cluster } from "../../shared/cluster";
import { Request } from "../../shared/request";

export class MapRegistryController {
    logger = new Logger("map");

    constructor(private registry: RegistryServer) {}

    register(app) {
        new Handler(app, Cluster.api.registry.map.domain, async params => {
			const host = params.host;
			const port = params.port;
			const application = params.application;
			const env = params.env;

			this.logger.log("mapping ", this.logger.hp(host, port), " to ", this.logger.ae(application, env));
			await this.domain(host, port, application, env);

			return {};
		});

		new Handler(app, Cluster.api.registry.map.webSocket, async params => {
			const host = params.host;
			const port = +params.port;
			const path = params.websocket;

			this.logger.log("mapping ", this.logger.hp(host, port), " on ", path);
			
			return await this.webSocket(host, port, path);
		});
    }

    async domain(host: string, port: number, application: string, env: string) {
		const id = Crypto.createId();

		fs.mkdirSync(RegistryPath.mappingDirectory(id));

		fs.writeFileSync(RegistryPath.mappingApplicationFile(id), application);
		fs.writeFileSync(RegistryPath.mappingEnvFile(id), env);
		fs.writeFileSync(RegistryPath.mappingHostFile(id), host);
		fs.writeFileSync(RegistryPath.mappingPortFile(id), port + "");

		await this.updateGateways();
	}

	async webSocket(socketHost: string, socketPort: number, socketPath: string) {
		for (let id of fs.readdirSync(RegistryPath.mappingsDirectory)) {
			const host = fs.readFileSync(RegistryPath.mappingHostFile(id)).toString();
			const port = +fs.readFileSync(RegistryPath.mappingPortFile(id)).toString();

			if (host == socketHost && port == socketPort) {
				if (!fs.existsSync(RegistryPath.mappingWebSocketsDirectory(id))) {
					fs.mkdirSync(RegistryPath.mappingWebSocketsDirectory(id));
				}

				fs.writeFileSync(RegistryPath.mappingWebSocketFile(id, Crypto.nameHash(socketPath)), socketPath);

				await this.updateGateways();

				return {
					application: fs.readFileSync(RegistryPath.mappingApplicationFile(id)).toString(),
					env: fs.readFileSync(RegistryPath.mappingEnvFile(id)).toString()
				};
			}
		}

		throw new Error(`No domain '${socketHost}:${socketPort}' registered`);
	}

    async updateGateways() {
		this.logger.log("updating gateways...");

		const routes = [];

		for (let id of fs.readdirSync(RegistryPath.mappingsDirectory)) {
			const host = fs.readFileSync(RegistryPath.mappingHostFile(id)).toString();
			const port = +fs.readFileSync(RegistryPath.mappingPortFile(id)).toString();
			const env = fs.readFileSync(RegistryPath.mappingEnvFile(id)).toString();
			const application = fs.readFileSync(RegistryPath.mappingApplicationFile(id)).toString();

			const latestVersion = fs.readFileSync(RegistryPath.applicationEnvLatestVersionFile(application, env)).toString();

			const instances = [];
			const sockets = [];

			for (let worker of this.registry.instances.runningWorkers) {
				if (worker.endpoint) {
					for (let id in worker.instances) {
						const instance = worker.instances[id];

						if (instance.application == application && instance.env == env && instance.version == latestVersion) {
							instances.push({
								id: id,
								worker: worker.name,
								endpoint: instance.worker.endpoint,
								port: instance.port
							});
						}
					}
				} else {
					this.logger.log("no endpoint set, skipped ", this.logger.w(worker.name), "");
				}
			}

			if (fs.existsSync(RegistryPath.mappingWebSocketsDirectory(id))) {
				for (let socket of fs.readdirSync(RegistryPath.mappingWebSocketsDirectory(id))) {
					sockets.push(fs.readFileSync(RegistryPath.mappingWebSocketFile(id, socket)).toString());
				}
			}

			if (instances.length) {
				const route = {
					application,
					env,
					host,
					port,
					instances,
					sockets
				} as any;

				if (fs.existsSync(RegistryPath.mappingSSLFile(id))) {
					route.ssl = +fs.readFileSync(RegistryPath.mappingSSLFile(id)).toString();
				}

				routes.push(route);
			} else {
				this.logger.log("no instances of ", this.logger.ae(application, env), " running, skipped");
			}
		}

		for (let gateway of fs.readdirSync(RegistryPath.gatewaysDirectory)) {
			const host = fs.readFileSync(RegistryPath.gatewayHostFile(gateway)).toString();
			const key = fs.readFileSync(RegistryPath.gatewayKeyFile(gateway)).toString();

			this.logger.log("upgrading ", this.logger.g(gateway), "...");

            await new Request(host, Cluster.api.gateway.reload)
                .append("key", key)
                .appendJSONBody(routes)
                .send();

			this.logger.log("upgraded ", this.logger.g(gateway));
		}

		this.logger.log("updated gateways");
	}
}