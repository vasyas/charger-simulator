import * as commandLineArgs from "command-line-args"
import * as commandLineUsage from "command-line-usage"
import * as readline from "readline"

import {log} from "./log"
import {ChargerSimulator} from "./ChargerSimulator"

const optionList = [
  {
    name: "csURL",
    type: String,
    description: "URL of the Central System server to connect to.\nThis is also a default option.",
    typeLabel: "{underline URL}",
    alias: "s",
    defaultOption: true,
  },
  {
    name: "chargerID",
    type: String,
    description: "OCPP ID to be used for simulating charger.\nDefault is 'test'.",
    typeLabel: "{underline ChargerID}",
    alias: "i",
    defaultValue: "test",
  },
  {
    name: "connectorID",
    type: String,
    description: "ID of the connector to send status when pressing keys.\nDefaults to 1.",
    typeLabel: "{underline ConnectorID}",
    alias: "c",
    defaultValue: 1,
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
  // const connectorID = 1
  // const csURL = `ws://proxy.aec.energy/ws`
  // const chargerID = "test"

  const {connectorID, csURL, chargerID} = commandLineArgs(optionList)

  if (!connectorID || !csURL || !chargerID) {
    const usage = commandLineUsage(usageSections)
    console.log(usage)
    return
  }

  const simulator = new ChargerSimulator({
    centralSystemEndpoint: csURL,
    chargerIdentity: chargerID,
  })
  await simulator.start()

  log.info("Charger emulator started")
  log.info(`Supported keys:
    Ctrl+C:   quit
    
    Control connector ${connectorID}
    ---
    a:        send Available status 
    p:        send Preparing status
    c:        send Charging status
    f:        send Finishing status
  `)

  async function sendStatus(status: string) {
    await simulator.centralSystem.StatusNotification({
      connectorId: connectorID,
      errorCode: "NoError",
      status,
    })
  }

  const commands = {
    a: () => sendStatus("Available"),
    p: () => sendStatus("Preparing"),
    c: () => sendStatus("Charging"),
    f: () => sendStatus("Finishing"),
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
