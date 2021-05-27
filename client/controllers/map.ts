import { Logger } from "../../shared/log";
import { Cluster } from "../../shared/cluster";
import { Request } from "../../shared/request";
import { Client } from "../client";

export class MapClientController {
    logger = new Logger("map");
    
    constructor(public client: Client) {}

    async domain(host: string, port: number, application: string, env: string) {
		await this.logger.process(["mapping ", this.logger.hp(host, port), " to ", this.logger.ae(application, env), "..."], async finished => {
			await new Request(this.client.host, Cluster.api.registry.map.domain)
				.auth(this.client.username, this.client.key)
				.append("host", host)
				.append("port", port)
				.append("application", application)
				.append("env", env)
				.send();

			finished("mapped ", host, ":" + port, " to ", this.logger.ae(application, env));
		});
	}

	async webSocket(host: string, port: number, path: string) {
		await this.logger.process(["mapping websocket ", this.logger.hp(host, port), " on ", path, "..."], async finished => {
			const res = await new Request(this.client.host, Cluster.api.registry.map.webSocket)
				.auth(this.client.username, this.client.key)
				.append("host", host)
				.append("port", port)
				.append("websocket", path)
				.send<{ application, env }>();

			finished("mapped websocket ", this.logger.hp(host, port), " on ", path, " to ", this.logger.ae(res.application, res.env));
		});
	}
}