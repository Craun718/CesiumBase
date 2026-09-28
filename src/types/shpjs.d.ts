declare module "shpjs" {
  const parseShapefile: (input: ArrayBuffer | Uint8Array) => Promise<unknown>

  export default parseShapefile
}
