import { Logger } from "../../log";
import { Cluster } from "../../shared/cluster";
import { Handler } from "../../shared/handler";
import { RegistryServer } from "../registry";
import fs = require("fs");
import { RegistryPath } from "../paths";

export class SSLRegistryController {
    logger = new Logger("ssl");

    constructor(private registry: RegistryServer) {}

    register(app) {
        new Handler(app, Cluster.api.registry.ssl.enable, async params => {
            const host = params.host;
            const port = params.port;

            for (let id of fs.readdirSync(RegistryPath.mappingsDirectory)) {
				if (fs.readFileSync(RegistryPath.mappingHostFile(id)).toString() == host) {
					fs.writeFileSync(RegistryPath.mappingSSLFile(id), port);

					return {};
				}
			}

            throw new Error("Domain not found!");
        });
    }
}