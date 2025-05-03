import { join } from 'path'
import { createBot, createProvider, createFlow, addKeyword, utils, EVENTS } from '@builderbot/bot'
import { JsonFileDB as Database } from '@builderbot/database-json'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import 'dotenv/config'
import { google } from 'googleapis'

const auth = new google.auth.GoogleAuth({
    keyFile: './google.json',  
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
})

const spreadsheetId = process.env.SHEET_ID

const PORT = process.env.PORT ?? 3008

const getHaversineDistance = (firstLocation, secondLocation) => {
    const earthRadius = 6371 // km

    const diffLat = (secondLocation.lat-firstLocation.lat) * Math.PI / 180
    const diffLng = (secondLocation.lng-firstLocation.lng) * Math.PI / 180

    const arc = Math.cos(
                    firstLocation.lat * Math.PI / 180) * Math.cos(secondLocation.lat * Math.PI / 180)
                    * Math.sin(diffLng/2) * Math.sin(diffLng/2)
                    + Math.sin(diffLat/2) * Math.sin(diffLat/2)
    const line = 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1-arc))

    const distance = earthRadius * line;

    return distance*1000;
}

const laEmpresa = { lat: -33.43765, lng: -70.65051 } //plaza de armas de Santiago

const welcomeFlow = addKeyword(EVENTS.WELCOME)
    .addAnswer([`*Chatbot* Registro de Asistencia`,
                `*[Nombre de la Empresa]* | *[99.999.999-9]*`
               ])
    .addAnswer(`📍️ Envía tu ubicación actual para registrar asistencia...`)

const flowLocation = addKeyword(EVENTS.LOCATION)
    .addAnswer("Hemos recibio desde tu 📱️, las coordenadas de tu ubicación!", null, async (ctx, { state } ) => {
	  const userLatitud = ctx.message.locationMessage.degreesLatitude
	  const userLongitud = ctx.message.locationMessage.degreesLongitude
          const userLocation = {lat: userLatitud, lng: userLongitud}
          let distancia = getHaversineDistance(laEmpresa, userLocation)
          await state.update({ name: ctx.name, number: ctx.from, distancia: distancia, ubicacion: userLocation })
     })
     .addAnswer([
            `Seleccione Acción :`,
            `*1* para *Entrada*`,
            `*2* para *Salida*`,
       ],
       { capture: true},
       async (ctx, { state, fallBack }) => {
           
           if (!["1", "2"].includes(ctx.body)) {
               return fallBack(`😟️ Respuesta no válida, por favor selecciona *1* para *Entrada*, *2* para *Salida*`)
           }

             if (ctx.body == 1) {
                await state.update({ evento: "Entrada" })
             }else if (ctx.body == 2){
                await state.update({ evento: "Salida" })
             }else{
                await state.update({ evento: "Sin Evento" }) 
             }
      
        })
     .addAction(async (_, { flowDynamic, state }) => {
	  await flowDynamic([
              `Haz enviado tu ubicación que te ubica a :`,
	      `${Math.trunc(state.get('distancia'))} metros.`
            ])
	  

             const sheets = google.sheets({ version: 'v4', auth })
             const range = 'Eventos!A1' 
             const valueInputOption = 'USER_ENTERED'

             let nombre = state.get('name')
             let latitud = state.get('ubicacion.lat')
             let longitud = state.get('ubicacion.lng')
             let aproximacion = Math.trunc(state.get('distancia'))
             let contacto = state.get('number')
             let fechahora = new Date().toLocaleString("es-CL").split(",", 2)
             let fecha = fechahora[0]
             let hora = fechahora[1]
             let marca = state.get('evento')
             let contacto64 = Buffer.from(contacto).toString('base64')

             let  values = [[fecha, hora, marca, contacto64, latitud, longitud, aproximacion]]

             const resource = { values: values }

		    try {
			const res = await sheets.spreadsheets.values.append({
			    spreadsheetId,
			    range,
			    valueInputOption,
			    resource,
			})
                           await flowDynamic(`Registro del Evento resulto ${res.statusText}`)
		    } catch (error) {			  
                          await flowDynamic(`Hubo un problema,intente enviar nuevamente su ubicación`)
		    }

     })


const main = async () => {
    const adapterFlow = createFlow([welcomeFlow, flowLocation])

    const adapterProvider = createProvider(Provider)

    const adapterDB = new Database({ filename: 'db.json' })

    const { handleCtx, httpServer } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })


    httpServer(+PORT)
}

main()
