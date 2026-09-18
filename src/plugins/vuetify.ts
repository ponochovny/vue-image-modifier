import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          primary: '#e76f51',
          secondary: '#2a9d8f',
          success: '#2a9d8f',
          surface: '#fbfaf7',
          background: '#e9eee9',
        },
      },
    },
  },
})
