import { Logger } from "../../shared/log";
import { Cluster } from "../../shared/cluster";
import { Request } from "../../shared/request";
import { Client } from "../client";

export class SSLClientController {
    logger = new Logger("ssl");

    constructor(public client: Client) {}

    async enable(host: string, port: number) {
		const logger = new Logger("ssl");

		await logger.process(["enabling ssl for ", logger.hp(host, port)], async finished => {
			await new Request(this.client.host, Cluster.api.registry.ssl.enable)
				.auth(this.client.username, this.client.key)
				.append("host", host)
				.append("port", port)
				.send();

			finished("enabled ssl for ", logger.hp(host, port), ". deploy new version to enable SSL");
		});
	}
}