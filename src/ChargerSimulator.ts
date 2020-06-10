import {createRpcClient} from "@push-rpc/core"
import {wrapWebsocket} from "@push-rpc/websocket/dist/server"
import * as WebSocket from "ws"
import {log} from "./log"

export interface Config {
  defaultHeartbeatIntervalSec?: number
  chargePointVendor?: string
  chargePointModel?: string
  bootOnStart?: boolean
  startDelayMs?: number
  stopDelayMs?: number
  keepAliveTimeoutMs?: number // set to null to disable pings
  meterValuesIntervalSec?: number

  centralSystemEndpoint: string
  chargerIdentity: string
}

const defaultConfig: Partial<Config> = {
  defaultHeartbeatIntervalSec: 30,
  chargePointVendor: "Test",
  chargePointModel: "1",
  bootOnStart: true,
  startDelayMs: 8 * 1000,
  stopDelayMs: 8 * 1000,
  keepAliveTimeoutMs: 50 * 1000,
  meterValuesIntervalSec: 20,
}

export class ChargerSimulator {
  constructor(config: Config) {
    this.config = {...defaultConfig, ...config}

    this.configurationKeys = [
      {key: "HeartBeatInterval", readonly: false, value: "" + config.defaultHeartbeatIntervalSec},
      {key: "ResetRetries", readonly: false, value: "1"},
      {key: "MeterValueSampleInterval", readonly: false, value: config.meterValuesIntervalSec},
    ]
  }

  async start() {
    const {remote} = await createRpcClient(
      0,
      () =>
        wrapWebsocket(
          new WebSocket(
            this.config.centralSystemEndpoint + "/" + this.config.chargerIdentity,
            "ocpp1.6"
          )
        ),
      {
        local: this.chargePoint,
        reconnect: true,
        keepAliveTimeout: this.config.keepAliveTimeoutMs,

        listeners: {
          messageIn: (data) => {
            log.debug("OCPP in", data)
          },
          messageOut: (data) => {
            log.debug("OCPP out", data)
          },
          connected() {
            log.debug("OCPP connected")
          },
          disconnected({code, reason}) {
            log.debug("OCPP disconnected", {code, reason})
          },
          subscribed(subscriptions: number): void {},
          unsubscribed(subscriptions: number): void {},
        },
      }
    )
    this.centralSystem = remote

    if (this.config.defaultHeartbeatIntervalSec) {
      setInterval(() => {
        this.centralSystem.Heartbeat()
      }, this.config.defaultHeartbeatIntervalSec * 1000)
    }
  }

  public centralSystem = null

  private config: Config = null
  private meterTimer = null
  private charged = 0
  private configurationKeys = []
  private chargePoint = {
    RemoteStartTransaction: async (req) => {
      const {connectorId, idTag} = req

      if (this.meterTimer) {
        return {
          status: "Rejected",
        }
      }

      setTimeout(async () => {
        const {transactionId} = await this.centralSystem.StartTransaction({
          connectorId,
          idTag,
          timestamp: new Date(),
          meterStart: 0,
        })

        this.charged = 0

        this.meterTimer = setInterval(() => {
          this.charged += Math.random() > 0.66 ? 30 : 20 // 26.6 W / 10s avg = 9.36 Kw

          this.centralSystem.MeterValues({
            connectorId,
            transactionId,
            values: [
              {
                timestamp: new Date(),
                values: [
                  {
                    value: "" + this.charged,
                    measurand: "Energy.Active.Import.Register",
                    unit: "Wh",
                  },
                ],
              },
            ],
          })
        }, this.config.meterValuesIntervalSec * 1000)
      }, this.config.startDelayMs)

      return {status: "Accepted"}
    },

    RemoteStopTransaction: async (req) => {
      const {transactionId} = req

      if (!this.meterTimer) {
        return {
          status: "Rejected",
        }
      }

      clearInterval(this.meterTimer)

      setTimeout(async () => {
        await this.centralSystem.StopTransaction({
          transactionId,
          timestamp: new Date(),
          meterStop: this.charged,
        })
      }, this.config.stopDelayMs)

      return {status: "Accepted"}
    },

    GetConfiguration: async (req) => ({configurationKey: this.configurationKeys}),
    ChangeConfiguration: async (req) => {
      for (let i = 0; i < this.configurationKeys.length; i++) {
        if (this.configurationKeys[i].key == req.key) {
          this.configurationKeys[i].value = "" + req.value
        }
      }

      return {status: "Accepted"}
    },

    ReserveNow: async (req) => {
      return {status: "Accepted"}
    },

    CancelReservation: async (req) => {
      return {status: "Accepted"}
    },

    Reset: async (req) => {
      return {status: "Accepted"}
    },

    TriggerMessage: async (req) => {
      return {status: "Accepted"}
    },
  }
}
