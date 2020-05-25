import {log} from "./log"
import {StationSimulator} from "./stationSimulator"
;(async () => {
  const connectorId = 1
  const centralSystemEndpoint = `ws://proxy.aec.energy/ws`
  const chargerIdentity = "test"

  const simulator = new StationSimulator({
    centralSystemEndpoint,
    chargerIdentity,
  })
  await simulator.start()

  log.info("Station emulator started")
  log.info(`Supported keys:
    q: quit
    ---
    a: send Available status
    p: send Preparing status
    c: send Charging status
    f: send Finishing status
    ---
  `)

  async function sendStatus(status: string) {
    await simulator.centralSystem.StatusNotification({
      connectorId,
      errorCode: "NoError",
      status,
    })
  }

  const commands = {
    q: () => process.exit(0),
    a: () => sendStatus("Available"),
    p: () => sendStatus("Preparing"),
    c: () => sendStatus("Charging"),
    f: () => sendStatus("Finishing"),
  }

  process.stdin.on("keypress", (ch, key) => {
    if (ch) {
      const command = commands[ch]
      command && command()
    }
  })

  process.stdin.setRawMode(true)
  process.stdin.resume()
})()
