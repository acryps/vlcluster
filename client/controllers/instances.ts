import { Client } from "../client";
import * as fetch from "node-fetch";
import { Logger } from "../../shared/log";
import { Cluster } from "../../shared/cluster";
import { Request } from "../../shared/request";

export class InstancesClientController {
    logger = new Logger("instances");

    constructor(public client: Client) {}

    async list(application: string, env: string) {
        let instances = await new Request(this.client.host, Cluster.api.registry.instances.list)
            .auth(this.client.username, this.client.key)
            .send<{ instance, application, version, env, port }[]>();

        if (application && application != "*") {
            instances = instances.filter(i => i.application == application);
        }

        if (env && env != "*") {
            instances = instances.filter(i => i.env == env);
        }

        return instances;
    }
}