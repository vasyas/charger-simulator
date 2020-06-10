import * as commandLineArgs from "command-line-args"
import * as commandLineUsage from "command-line-usage"
import * as readline from "readline"

import {log} from "./log"
import {ChargerSimulator} from "./ChargerSimulator"

const optionList = [
  {
    name: "csURL",
    type: String,
    description:
      "URL of the Central System server to connect to, ws://server.name/path.\nThis is also a default option.",
    typeLabel: "{underline URL}",
    alias: "s",
    defaultOption: true,
  },
  {
    name: "chargerId",
    type: String,
    description: "OCPP ID to be used for simulating charger.\nDefault is 'test'.",
    typeLabel: "{underline ChargerId}",
    alias: "i",
    defaultValue: "test",
  },
  {
    name: "connectorId",
    type: String,
    description: "ID of the connector to send status when pressing keys.\nDefaults to 1.",
    typeLabel: "{underline ConnectorId}",
    alias: "c",
    defaultValue: 1,
  },
  {
    name: "idTag",
    type: String,
    description: "ID Tag to start transaction.\nDefaults to 123456.",
    typeLabel: "{underline idTag}",
    alias: "t",
    defaultValue: "123456",
  },
]

const usageSections = [
  {
    header: "charger-simulator",
    content: "Start OCPP charging station simulator, connect simulator to Central System server.",
  },
  {
    header: "Options",
    optionList,
  },
]

;(async () => {
  const {connectorId, csURL, chargerId, idTag} = commandLineArgs(optionList)

  if (!connectorId || !csURL || !chargerId) {
    const usage = commandLineUsage(usageSections)
    console.log(usage)
    return
  }

  log.info("Starting charger simulator", {
    csURL,
    connectorId,
    chargerId,
    idTag,
  })

  const simulator = new ChargerSimulator({
    centralSystemEndpoint: csURL,
    chargerIdentity: chargerId,
  })
  await simulator.start()

  log.info("Connected to Central System")
  log.info(`Supported keys:
    Ctrl+C:   quit
    
    Connector ${connectorId} status
    ---
    a:        send Available status 
    p:        send Preparing status
    c:        send Charging status
    f:        send Finishing status
    
    Transaction on connector ${connectorId}, tag ${idTag}
    --
    u:        Authorize
    s:        StartTransaction
    t:        StopTransaction
  `)

  async function sendStatus(status: string) {
    await simulator.centralSystem.StatusNotification({
      connectorId: connectorId,
      errorCode: "NoError",
      status,
    })
  }

  const commands = {
    a: () => sendStatus("Available"),
    p: () => sendStatus("Preparing"),
    c: () => sendStatus("Charging"),
    f: () => sendStatus("Finishing"),

    u: () => simulator.centralSystem.Authorize({idTag}),
    s: () => simulator.startTransaction({idTag, connectorId}),
    t: () => simulator.stopTransaction(),
  }

  readline.emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)

  process.stdin.on("keypress", (ch, key) => {
    if (key.ctrl && key.name === "c") {
      process.exit()
    }

    if (ch) {
      const command = commands[ch]
      command && command()
    }
  })
})()
