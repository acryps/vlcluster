import { Cluster } from "./cluster";
import * as fetch from "node-fetch";

export class Request {
    data = {};
    body: any;

    constructor(private endpoint: string, private api: string) {}

    append(key: string, value: string | number) {
        this.data[`cluster-${key}`] = value;

        return this;
    }

    auth(username: string, key: string) {
        this.data["cluster-auth-username"] = username;
        this.data["cluster-auth-key"] = key;

        return this;
    }

    appendBody(content) {
        this.body = content;

        return this;
    }

    appendJSONBody(content) {
        this.body = JSON.stringify(content);
        this.data["content-type"] = "application/json";

        return this;
    }

    private constructRequest() {
        return fetch(`http://${this.endpoint}:${Cluster.port}${this.api}`, {
            method: "POST", 
            headers: this.data,
            body: this.body
        });
    }

    send<TResult = {}>() {
        return this.constructRequest().then(r => r.json()).then(res => {
            if ("error" in res) {
                throw new Error(res.error);
            } else {
                return res.data as TResult;
            }
        });
    }

    async pipe(stream) {
        const request = this.constructRequest();

        request.body.pipe(stream);
    }
}