import { Logger } from "../../shared/log";
import { RegistryServer } from "../registry";
import fs = require("fs");
import { Crypto } from "../../shared/crypto";
import { Handler } from "../../shared/handler";
import { Cluster } from "../../shared/cluster";
import { Request } from "../../shared/request";
import { DomainRoute } from "../../shared/models/routes/domain";
import { Application } from "../../shared/models/application";
import { Environnement } from "../../shared/models/environnement";
import { Configuration } from "../../shared/configuration";
import { env } from "process";
import { Route, RoutedInstance } from "../../gateway/route";

export class RouteRegistryController {
    logger = new Logger("route");

    constructor(private registry: RegistryServer) {}

    register(app) {
        new Handler(app, Cluster.api.registry.route.domain, async params => {
			const host = params.host;
			const port = params.port;
			const applicationName = params.application;
			const envName = params.env;

			const application = this.registry.configuration.applications.find(a => a.name == applicationName);
			const env = application.environnements.find(e => e.name == envName);

			this.logger.log("routing ", this.logger.hp(host, port), " to ", this.logger.ae(application.name, env.name));
			await this.domain(host, port, application, env);

			return {};
		});

		new Handler(app, Cluster.api.registry.route.webSocket, async params => {
			const host = params.host;
			const port = +params.port;
			const path = params.websocket;

			for (let application of this.registry.configuration.applications) {
				for (let env of application.environnements) {
					for (let domain of env.routes) {
						if (domain.host == host && domain.port == port) {
							this.logger.log("routing ", this.logger.hp(host, port), " on ", path);
			
							await this.webSocket(domain, path);

							return {
								application: application.name,
								env: env.name
							};
						}
					}
				}
			}

			throw new Error(`route '${host}' on port ${port} not found!`);
		});
    }

    async domain(host: string, port: number, application: Application, env: Environnement) {
		const id = Crypto.createId(host);

		const route: DomainRoute = {
			host,
			port,
			webSockets: []
		};

		env.routes.push(route);
		Configuration.save();

		await this.updateGateways();
	}

	async webSocket(domain: DomainRoute, path: string) {
		domain.webSockets.push({
			path
		});
		Configuration.save();

		await this.updateGateways();
	}

    async updateGateways() {
		this.logger.log("updating gateways...");

		const routes: Route[] = [];

		for (let application of this.registry.configuration.applications) {
			for (let env of application.environnements) {
				const instances: RoutedInstance[] = [];

				for (let instance of application.instances) {
					if (instance.running && instance.env.name == env.name && instance.version.name == env.latestVersion.name) {
						instances.push({
							name: instance.name,
							worker: instance.worker.name,
							endpoint: instance.worker.endpoint,
							port: instance.port
						});
					}
				}

				if (instances.length) {
					for (let domain of env.routes) {
						const route: Route = {
							application: application.name,
							env: env.name,
							host: domain.host,
							port: domain.port,
							instances,
							sockets: domain.webSockets.map(s => s.path),
							version: env.latestVersion.name
						};

						if (domain.ssl) {
							route.ssl = domain.ssl.port;
						}

						routes.push(route);
					}

					if (!env.routes.length) {
						this.logger.log("no domains routed for ", this.logger.ae(application.name, env.name), ", skipped");
					}
				} else {
					this.logger.log("no instances of ", this.logger.ae(application.name, env.name), " running, skipped");
				}
			}
		}

		for (let gateway of this.registry.configuration.gateways) {
			this.logger.log("upgrading ", this.logger.g(gateway.name), "...");

			await new Request(gateway.endpoint, Cluster.api.gateway.reload)
				.append("key", gateway.key)
				.appendJSONBody(routes)
				.send();

			this.logger.log("upgraded ", this.logger.g(gateway.name));
		}

		this.logger.log("updated gateways");
	}
}