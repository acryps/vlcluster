import * as sha from "js-sha512";

export class Logger {
    color;

    static loadingFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

    constructor(public unit: string) {
        const hash = sha.sha512(unit);

        this.color = (hash.split("").reduce((a, c) => a + parseInt(c, 16), 0) * 21 + 41) % 213 + 17;
    }

    log(...text: string[]) {
        process.stdout.write(`[  \x1b[38;5;${this.color}m${this.unit}\x1b[0m ]\t${text.join("")}\n`);
    }

    warn(...text: string[]) {
        process.stdout.write(`\x1b[48;5;190m\x1b[1;30m[! ${this.unit} ]\x1b[0m \t${text.join("")}\n`);
    }

    table(data: any[]) {
        if (!Array.isArray(data)) {
            data = Object.keys(data).map(k => ({
                key: k,
                value: data[k]
            }));
        }

        const keys = {};

        for (let item of data) {
            for (let key in item) {
                const len = `${item[key]}`.length;

                if (key in keys) {
                    if (keys[key] < len) {
                        keys[key] = len;
                    }
                } else {
                    keys[key] = Math.max(key.length, len);
                }
            }
        }

        process.stdout.write(`┌─${Object.keys(keys).map(key => "─".repeat(keys[key])).join("─┬─")}─┐\n`);
        process.stdout.write(`│ ${Object.keys(keys).map(key => key.padEnd(keys[key], " ")).join(" │ ")} │\n`);
        process.stdout.write(`├─${Object.keys(keys).map(key => "─".repeat(keys[key])).join("─┼─")}─┤\n`);
        
        for (let item of data) {
            process.stdout.write(`│ ${Object.keys(keys).map(key => `${key in item ? item[key] : ""}`.padEnd(keys[key], " ")).join(" │ ")} │\n`);
        }

        process.stdout.write(`└─${Object.keys(keys).map(key => "─".repeat(keys[key])).join("─┴─")}─┘\n`);
    }

    async process(text: string[] | string, handler: (finished: (...text: string[]) => void) => {}) {
        let i = 0;

        text = Array.isArray(text) ? text.join("") : text;

        process.stdout.write(`[${Logger.loadingFrames[0]} \x1b[38;5;${this.color}m${this.unit}\x1b[0m ]\t${text}\r`);

        const interval = setInterval(() => {
            process.stdout.write(`[${Logger.loadingFrames[i++ % (Logger.loadingFrames.length - 1)]}\r`);
        }, 100);
        
        try {
            let result;

            await handler((...text: string[]) => {
                result = text;
            });

            clearInterval(interval);

            process.stdout.write(`[✔${result ? ` \x1b[38;5;${this.color}m${this.unit}\x1b[0m ]\t${result.join("").padEnd(text.length)}` : ""}\n`);
        } catch (e) {
            clearInterval(interval);

            process.stdout.write(`[✗\n`);

            throw e;
        }
    }

    av(application: string, version: string) {
        return `\u001b[1m${application}:${version}\u001b[0m`;
    }

    ae(application: string, env: string) {
        return `\u001b[1m${application}[${env}]\u001b[0m`;
    }

    aev(application: string, env: string, version: string) {
        return `\u001b[1m${application}[${env}]:${version}\u001b[0m`;
    }

    aevi(application: string, env: string, version: string, instance: string) {
        return `\u001b[1m${application}[${env}]:${version}(${instance.substr(0, 8) + (instance.length > 8 ? "…" : "")})\u001b[0m`;
    }

    w(worker: string) {
        return `\u001b[1m<${worker}>\u001b[0m`;
    }

    c(cluster: string) {
        return `\u001b[1m{${cluster}}\u001b[0m`;
    }

    cw(cluster: string, worker: string) {
        return `\u001b[1m{${cluster}}<${worker}>\u001b[0m`;
    }

    g(gateway: string) {
        return `\u001b[1m#${gateway}\u001b[0m`;
    }

    p(port: number) {
        return `\u001b[1m:${port}\u001b[0m`;
    }

    cg(cluster: string, gateway: string) {
        return `\u001b[1m{${cluster}}#${gateway}\u001b[0m`;
    }

    hp(host: string, port: number) {
        return `\u001b[1m${host}:${port}\u001b[0m`;
    }

    i(instance: string) {
        return `\u001b[1m(${instance.substr(0, 8) + (instance.length > 8 ? "…" : "")})\u001b[0m`;
    }

    wi(worker: string, instance: string) {
        return `\u001b[1m<${worker}>(${instance.substr(0, 8) + (instance.length > 8 ? "…" : "")})\u001b[0m`;
    }
}