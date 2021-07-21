// SOAP bindings for OCPP 1.5

import * as path from "path"
import * as UUID from "uuid-js"
import {createClient, createServer, getClientKeys, promisifyServer} from "./nodeSoapUtils"

export function createChargePointServer(target, port) {
  const keys = Object.keys(target)

  const a = promisifyServer(target, keys)

  const soapService = {
    ChargePointService: {
      ChargePointServiceSoap12: a,
    },
  }

  return createServer({
    wsdlFile: path.resolve(__dirname, "wsdl", "15", "ocpp_chargepointservice_1.5_final.wsdl"),

    path: "/",
    port,
    soapService,
  })
}

export async function createCentralSystemClient(
  endpoint,
  chargeBoxIdentity,
  chargeBoxEndpoint
): Promise<any> {
  const client = await createClient(
    chargeBoxIdentity,
    path.resolve(__dirname, "wsdl", "15", "ocpp_centralsystemservice_1.5_final.wsdl"),
    endpoint
  )
  return withSetWsAddressingHeaders(
    client,
    chargeBoxIdentity,
    chargeBoxEndpoint,
    endpoint,
    getClientKeys(client),
    "urn://Ocpp/Cs/2012/06/"
  )
}

function withSetWsAddressingHeaders(
  target,
  chargeBoxIdentity,
  fromEndPoint,
  toEndPoint,
  keys,
  idNs
) {
  const wsa = `xmlns:a="http://www.w3.org/2005/08/addressing"`

  return proxy(
    target,
    (impl, key, ...args) => {
      target.clearSoapHeaders()

      const action = "/" + key
      const uuid = UUID.create()

      target.addSoapHeader(
        `<chargeBoxIdentity xmlns="${idNs}">${chargeBoxIdentity}</chargeBoxIdentity>`
      )
      target.addSoapHeader(`<a:MessageID ${wsa}>urn:uuid:${uuid}</a:MessageID>`)
      target.addSoapHeader(`<a:From ${wsa}><a:Address>${fromEndPoint}</a:Address></a:From>`)
      target.addSoapHeader(
        `<a:ReplyTo ${wsa}><a:Address>http://www.w3.org/2005/08/addressing/anonymous</a:Address></a:ReplyTo>`
      )
      target.addSoapHeader(`<a:To ${wsa}>${toEndPoint}</a:To>`)
      target.addSoapHeader(`<a:Action ${wsa} soap:mustUnderstand="1">${action}</a:Action>`)

      return impl(...args)
    },
    keys
  )
}

function proxy<T extends object>(target: T, invoker, keys: string[]): T {
  const r = {...(target as any)}

  keys.forEach((key) => {
    r[key] = function (...args) {
      const impl = target[key]
      return invoker(impl, key, ...args)
    }
  })

  return r as any
}
