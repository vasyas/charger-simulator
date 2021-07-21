// tweaks for working with strong-soap

import * as fs from "fs"
import * as http from "http"
import {soap} from "strong-soap"
import {log} from "@push-rpc/micro/lib/logger"
import {OcppContext} from "../../../ocpp/tools"
import {
  convertDateToString,
  convertStringToDate,
  ISO8601,
  ISO8601_secs,
  proxify,
  proxy,
} from "../../../serverUtils"
import {ChargePointLogType} from "../../../../../schema/chargePoints"
import {prettyPrintXml} from "./xmlUtils"
import {ocppLog} from "../../../ocppLogger"

let server = null

export function createServer({
  wsdlFile,
  soapService,
  path,
  port,
  app = undefined,
}): Promise<string> {
  const wsdl = fs.readFileSync(wsdlFile, "utf8")

  const endpoint = `http://localhost:${port}${path}`

  if (app) {
    createServerInKoa(app, port, path, soapService, wsdl)
    return Promise.resolve(endpoint)
  } else {
    return new Promise((resolve, reject) => {
      const createServer = () => {
        server = http.createServer((request, response) => {
          response.end(`404: Not Found: ${request.url}`)
        })

        server.listen(port, () => {
          log.info(`OCPP Server is listening on port ${port}`)
          resolve(server)
        })

        const soapServer = soap.listen(server, path, soapService, wsdl)
        soapServer.log = soapServerLog
      }

      if (server) {
        server.close(createServer)
      } else {
        createServer()
      }
    })
  }
}

export async function createClient(chargeBoxId, wsdlFile, endpoint): Promise<any> {
  return new Promise((resolve, reject) => {
    soap.createClient(wsdlFile, {endpoint, attributesKey: "attributes"}, (err, client) => {
      if (err) reject(err)
      else {
        const keys = getClientKeys(client)

        promisifyClient(chargeBoxId, client, keys)
        resolve(client)
      }
    })
  })
}

export function getClientKeys(client): string[] {
  const d = client.describe()

  const service = d[Object.keys(d)[0]]
  const binding = service[Object.keys(service)[0]]

  return Object.keys(binding)
}

function uncap(s) {
  return s[0].toLowerCase() + s.substring(1)
}

function promisifyClient(chargeBoxId, target, keys) {
  target.on("request", (envelope) => {
    logOcppRequest(chargeBoxId, envelope)
  })

  proxify(
    target,
    (impl, key, message) => {
      return new Promise((resolve, reject) => {
        const inputMessage = wrapMessage(key, soapDateToString(message), "Request")

        impl(inputMessage, (err, result, envelope) => {
          logOcppResponse(chargeBoxId, envelope)

          if (err) {
            const e = err.Fault ? err.Fault : err
            log.error(`Failed to call ${key}`, e)
            reject(e)
          } else {
            resolve(result)
          }
        })
      })
    },
    keys
  )
}

// see https://github.com/strongloop/strong-soap/issues/49
// see https://github.com/strongloop/strong-soap/issues/113
function wrapMessage(operationName, message, wrapperName) {
  return {
    [uncap(operationName) + wrapperName]: message,
  }
}

function soapDateToString(message) {
  return convertDateToString(message, (d) => d.toISOString())
}

function soapStringToDate(message) {
  return convertStringToDate(
    message,
    (s) => ISO8601.test(s) || ISO8601_secs.test(s),
    (s) => new Date(s)
  )
}

/** Convert promise-based WS impl to node-soap compat, also date fixes */
export function promisifyServer(target, keys) {
  return proxy(
    target,
    (impl, key, args, callback, headers, req) => {
      const promise = impl(soapStringToDate(args), headers, req)

      promise
        .then((r) => {
          callback(wrapMessage(key, soapDateToString(r), "Response"))
        })
        .catch((e) => {
          log.error(`Failed to serve ${key}`, e.Fault ? e.Fault : e)

          callback(null, {
            Fault: {
              Code: {
                Value: "soap:Sender",
                Subcode: {value: "rpc:BadArguments"},
              },
              Reason: {Text: "Processing Error"},
            },
          })
        })
    },
    keys
  )
}

function createServerInKoa(app, port, path, soapService, wsdl) {
  const koaWrapper = {
    listeners: () => [],
    removeAllListeners: () => {},
    addListener: () => {},
  }

  const server = soap.listen(koaWrapper, {
    path,
    services: soapService,
    xml: wsdl,
    attributesKey: "attributes",
  })
  server.log = soapServerLog

  app.use((ctx, next) => {
    if (ctx.path.startsWith(path)) {
      soapService.ctx = {
        // create context for passing into service impl
        sql: ctx.sql,
        requestBody: ctx.request.body,
      } as OcppContext

      const {promise, res} = wrapResponse(ctx.response, soapService.ctx)

      server._requestListener(ctx.req, res)
      return promise
    }

    return next()
  })

  return `http://localhost:${port}${path}`
}

function wrapResponse(response, ctx: OcppContext) {
  let resolve

  const promise = new Promise((r) => {
    resolve = r
  })

  const res = {
    statusCode: undefined,

    write: (body) => {
      if (res.statusCode) response.status = res.statusCode

      setImmediate(async () => {
        const details = await prettyPrintXml(body)
        ocppLog(ChargePointLogType.OcppOut, ctx.pointId, details)
      })

      response.body = body
    },

    setHeader: (name, value) => {
      response.set(name, value)
    },

    end: () => {
      resolve()
    },
  }

  return {res, promise}
}

function soapServerLog(type, data) {
  if (type == "error") log.error(data)
}

export async function logOcppRequest(chargeBoxId, envelope) {
  if (process.env.noRequestLogging) return
  const details = await prettyPrintXml(envelope)
  ocppLog(ChargePointLogType.OcppOut, chargeBoxId, details)
}

export async function logOcppResponse(chargeBoxId, envelope) {
  if (process.env.noRequestLogging) return
  const details = await prettyPrintXml(envelope)
  ocppLog(ChargePointLogType.OcppIn, chargeBoxId, details)
}
