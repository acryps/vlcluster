import { Logger } from "../../shared/log";
import { RegistryServer } from "../registry";
import fs = require("fs");
import { Crypto } from "../../shared/crypto";
import { RegistryPath } from "../paths";
import { Handler } from "../../shared/handler";
import { Cluster } from "../../shared/cluster";
import { Request } from "../../shared/request";

export class RouteRegistryController {
    logger = new Logger("route");

    constructor(private registry: RegistryServer) {}

    register(app) {
        new Handler(app, Cluster.api.registry.route.domain, async params => {
			const host = params.host;
			const port = params.port;
			const application = params.application;
			const env = params.env;

			this.logger.log("routing ", this.logger.hp(host, port), " to ", this.logger.ae(application, env));
			await this.domain(host, port, application, env);

			return {};
		});

		new Handler(app, Cluster.api.registry.route.webSocket, async params => {
			const host = params.host;
			const port = +params.port;
			const path = params.websocket;

			this.logger.log("routing ", this.logger.hp(host, port), " on ", path);
			
			return await this.webSocket(host, port, path);
		});
    }

    async domain(host: string, port: number, application: string, env: string) {
		const id = Crypto.createId(host);

		fs.mkdirSync(RegistryPath.routeDirectory(id));

		fs.writeFileSync(RegistryPath.routeApplicationFile(id), application);
		fs.writeFileSync(RegistryPath.routeEnvFile(id), env);
		fs.writeFileSync(RegistryPath.routeHostFile(id), host);
		fs.writeFileSync(RegistryPath.routePortFile(id), port + "");

		await this.updateGateways();
	}

	async webSocket(socketHost: string, socketPort: number, socketPath: string) {
		for (let id of fs.readdirSync(RegistryPath.routesDirectory)) {
			const host = fs.readFileSync(RegistryPath.routeHostFile(id)).toString();
			const port = +fs.readFileSync(RegistryPath.routePortFile(id)).toString();

			if (host == socketHost && port == socketPort) {
				if (!fs.existsSync(RegistryPath.routeWebSocketsDirectory(id))) {
					fs.mkdirSync(RegistryPath.routeWebSocketsDirectory(id));
				}

				fs.writeFileSync(RegistryPath.routeWebSocketFile(id, Crypto.nameHash(socketPath)), socketPath);

				await this.updateGateways();

				return {
					application: fs.readFileSync(RegistryPath.routeApplicationFile(id)).toString(),
					env: fs.readFileSync(RegistryPath.routeEnvFile(id)).toString()
				};
			}
		}

		throw new Error(`No domain '${socketHost}:${socketPort}' registered`);
	}

    async updateGateways() {
		this.logger.log("updating gateways...");

		const routes = [];

		for (let id of fs.readdirSync(RegistryPath.routesDirectory)) {
			const host = fs.readFileSync(RegistryPath.routeHostFile(id)).toString();
			const port = +fs.readFileSync(RegistryPath.routePortFile(id)).toString();
			const env = fs.readFileSync(RegistryPath.routeEnvFile(id)).toString();
			const application = fs.readFileSync(RegistryPath.routeApplicationFile(id)).toString();

			const latestVersion = fs.readFileSync(RegistryPath.applicationEnvLatestVersionFile(application, env)).toString();

			const instances = [];
			const sockets = [];

			for (let worker of this.registry.instances.workers) {
				if (worker.endpoint) {
					for (let instance of worker.instances) {
						if (instance.application == application && instance.env == env && instance.version == latestVersion && instance.port) {
							instances.push({
								id: instance.id,
								worker: worker.name,
								endpoint: instance.worker.endpoint,
								port: instance.port
							});

							console.log(`     ${application}[${env}] -> ${instance.worker.endpoint}:${instance.port} (${instance.id})`)
						}
					}
				} else {
					this.logger.log("no endpoint set, skipped ", this.logger.w(worker.name), "");
				}
			}

			if (fs.existsSync(RegistryPath.routeWebSocketsDirectory(id))) {
				for (let socket of fs.readdirSync(RegistryPath.routeWebSocketsDirectory(id))) {
					sockets.push(fs.readFileSync(RegistryPath.routeWebSocketFile(id, socket)).toString());
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

				if (fs.existsSync(RegistryPath.routeSSLFile(id))) {
					route.ssl = +fs.readFileSync(RegistryPath.routeSSLFile(id)).toString();
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