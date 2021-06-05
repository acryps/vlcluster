import * as path from "path";

import { Cluster } from "../shared/cluster";
import { Crypto } from "../shared/crypto";

export class GatewayPath {
    static get rootDirectory() {
		return path.join(Cluster.localDirectory, "gateways");
    }
    
    static nginxFile(name: string) {
		return "/" + path.join("etc", "nginx", "sites-enabled", Crypto.sanitizeGatewayName(name));
	}

	static nginxIncludeFile(name: string) {
		return "/" + path.join("etc", "nginx", "snippets", `${Crypto.sanitizeGatewayName(name)}.include`);
	}

    static gatewayDirectory(name: string) {
		return path.join(this.rootDirectory, Crypto.sanitizeGatewayName(name));
	}
	
	static gatewayClusterHostFile(name: string) {
		return path.join(this.gatewayDirectory(name), "cluster-host");
	}
	
	static gatewayClusterKeyFile(name: string) {
		return path.join(this.gatewayDirectory(name), "key");
	}
	
	static gatewayEndpointHostFile(name: string) {
		return path.join(this.gatewayDirectory(name), "endpoint-host");
	}
    
    static gatewayDomainsDirectory(name: string) {
		return path.join(this.gatewayDirectory(name), "domains");
    }

    static gatewayDomainDirectory(name: string, domain: string) {
		return path.join(this.gatewayDomainsDirectory(name), Crypto.nameHash(domain));
    }

    static gatewayDomainHostnameFile(name: string, domain: string) {
		return path.join(this.gatewayDomainDirectory(name, domain), "hostname");
    }

    static gatewayDomainRoutingDirectory(name: string, domain: string) {
		return path.join(this.gatewayDomainDirectory(name, domain), "mappings");
    }

    static gatewayDomainRouteDirectory(name: string, domain: string, application: string, env: string) {
		return path.join(this.gatewayDomainRoutingDirectory(name, domain), Crypto.nameHash(domain, application, env));
    }

    static gatewayDomainRouteApplicationFile(name: string, domain: string, application: string, env: string) {
		return path.join(this.gatewayDomainRouteDirectory(name, domain, application, env), "application");
    }

    static gatewayDomainRouteEnvFile(name: string, domain: string, application: string, env: string) {
		return path.join(this.gatewayDomainRouteDirectory(name, domain, application, env), "env");
	}
	
	static letsencryptRoot(host: string) {
		return path.join("/etc/letsencrypt/live/", host);
	}

	static letsencryptFullchain(host: string) {
		return path.join(this.letsencryptRoot(host), "fullchain.pem");
	}

	static letsencryptPrivateKey(host: string) {
		return path.join(this.letsencryptRoot(host), "privkey.pem");
	}
}