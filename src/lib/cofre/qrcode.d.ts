// qrcode no trae tipos: solo se usa toDataURL (el QR de «Agregar dispositivo» del Cofre)
declare module 'qrcode' {
  const QRCode: { toDataURL(texto: string, opciones?: Record<string, unknown>): Promise<string> }
  export default QRCode
}
