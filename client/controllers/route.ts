import { Logger } from "../../shared/log";
import { Cluster } from "../../shared/cluster";
import { Request } from "../../shared/request";
import { Client } from "../client";

export class RouteClientController {
    logger = new Logger("route");
    
    constructor(public client: Client) {}

    async domain(host: string, port: number, application: string, env: string) {
		if (!(/^[\x00-\x7F]*$/.test(host))) {
			throw new Error('domain names cannot contain non-ACII characters. Use punicode instead! [https://www.punycoder.com/]');
		}

		await this.logger.process(["routing domain ", this.logger.hp(host, port), " to ", this.logger.ae(application, env), "..."], async finished => {
			await new Request(this.client.configuration.host, Cluster.api.registry.route.domain)
				.auth(this.client.configuration.name, this.client.configuration.key)
				.append("host", host)
				.append("port", port)
				.append("application", application)
				.append("env", env)
				.send();

			finished("routed ", host, ":" + port, " to ", this.logger.ae(application, env));
		});
	}

	async webSocket(host: string, port: number, path: string) {
		await this.logger.process(["routing websocket ", this.logger.hp(host, port), " on ", path, "..."], async finished => {
			const res = await new Request(this.client.configuration.host, Cluster.api.registry.route.webSocket)
				.auth(this.client.configuration.name, this.client.configuration.key)
				.append("host", host)
				.append("port", port)
				.append("websocket", path)
				.send<{ application, env }>();

			finished("routed websocket ", this.logger.hp(host, port), " on ", path, " to ", this.logger.ae(res.application, res.env));
		});
	}
}