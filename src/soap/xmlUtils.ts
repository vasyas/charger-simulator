import {Builder, parseString} from "xml2js"

export async function prettyPrintXml(xml): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    parseString(xml, (err, parsed) => {
      if (err) {
        reject(err)
        return
      }

      try {
        const formatted = new Builder({headless: true}).buildObject(parsed)

        resolve("\n" + formatted.replace(/n\/  \n/g))
      } catch (e) {
        reject(e)
      }
    })
  })
}
