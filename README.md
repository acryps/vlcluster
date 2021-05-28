# vlcluster
Simple docker-based cluster designed for multi-env web applications.

> vlcluster was written as a prototype and will be rewritten soon

## Commands
### Setup
```
vlcluster init [client] [-e | --email <email>] [-h | --hostname <registry hostname>] [-k | --key <registry key>]
vlcluster init registry [-n | --name <registry name>]
vlcluster init worker [-h | --hostname <registry hostname>] [-k | --key <registry key>] [-n | --name <worker name>]
vlcluster init endpoint [-c | --cluster <registry hostname>] [-h | --hostname <endpoint hostname>]
vlcluster init gateway [--cluster-hostname <cluster hostname>] [--cluster-key <cluster key>] [-n | --name <gateway name>] [--endpoint-hostname <endpoint hostname>]
```

### Building and Publishing
```
vlcluster build [[ -p | --project-path ] <project path> = "."] [[ -d | --dockerfile ] <dockerfile path> = "Dockerfile"]
vlcluster push [-c | --cluster <registry hostname>] [[ -a | --application ] <application>] [[ -v | --version ] <version>]
vlcluster upgrade [-c | --cluster <registry hostname>] [[ -a | --application ] <application>] [[ -v | --version ] <version>] [[ -e | --env ] <environnement>]

vlcluster deploy [-c | --cluster <registry hostname>] [[ -e | --env ] <environnement>] [[ -p | --project-path ] <project path> = "."]
```

### Variables
```
vlcluster var set [-c | --cluster <registry hostname>] [[ -n | --name ] <name>] [[ -v | --value ] <value>] [-a | --application [ <application> ]] [-e | --env [ <environnement> ]]
vlcluster var list [-c | --cluster <registry hostname>] [-a | --application [ <application> ]] [-e | --env [ <environnement> ]]
```

### Instance Management
```
vlcluster instance list [-c | --cluster <registry hostname>] [-a | --application [ <application> ]] [-e | --env [ <environnement> ]]
vlcluster instance restart [-c | --cluster <registry hostname>] [-a | --application [ <application> ]] [-e | --env [ <environnement> ]]
```

### Routing
```
vlcluster route domain [-c | --cluster <registry hostname>] [-h | --host <host>] [-p | --port <port>] [-a | --application <application>] [-h | --host <host>] [-e | --env <env>]
vlcluster route websocket [-c | --cluster <registry hostname>] [-h | --host <host>] [-p | --port <port>] [-l | --location <location>]
```

### SSL 
```
vlcluster ssl enable [-c | --cluster <registry hostname>] [-h | --host <host>] [-p | --port <port>]
```