import { appendFile } from "fs";
import * as path from "path";

import { Cluster } from "../cluster";
import { Crypto } from "../crypto";

export class GatewayPath {
    static get rootDirectory() {
		return path.join(Cluster.localDirectory, "gateways");
    }
    
    static nginxFile(name: string) {
		return "/" + path.join("etc", "nginx", "sites-enabled", Crypto.sanitizeGatewayName(name));
	}

	static nginxIncludeFile(name: string) {
		return "/" + path.join("etc", "nginx", "sites-enabled", `${Crypto.sanitizeGatewayName(name)}.include`);
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

    static gatewayDomainMappingsDirectory(name: string, domain: string) {
		return path.join(this.gatewayDomainDirectory(name, domain), "mappings");
    }

    static gatewayDomainMappingDirectory(name: string, domain: string, application: string, env: string) {
		return path.join(this.gatewayDomainMappingsDirectory(name, domain), Crypto.nameHash(domain, application, env));
    }

    static gatewayDomainMappingApplicationFile(name: string, domain: string, application: string, env: string) {
		return path.join(this.gatewayDomainMappingDirectory(name, domain, application, env), "application");
    }

    static gatewayDomainMappingEnvFile(name: string, domain: string, application: string, env: string) {
		return path.join(this.gatewayDomainMappingDirectory(name, domain, application, env), "env");
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

	static letsencryptOptions() {
		return "/etc/letsencrypt/options-ssl-nginx.conf";
	}

	static letsencryptDHParams() {
		return "/etc/letsencrypt/ssl-dhparams.pem";
	}
}