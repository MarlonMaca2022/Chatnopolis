// Contenido de las páginas legales. Es un módulo de datos a propósito (sin JSX):
// el texto legal se corrige sin tocar componentes, y LegalPage.jsx renderiza
// cualquier entrada de LEGAL_PAGES sin saber de qué página se trata.
//
// LEGAL es la ÚNICA constante que hay que cambiar para nombrar un responsable
// legal distinto o una jurisdicción: se propaga a las tres páginas.
//
// `actualizado` tiene que coincidir con TERMS_VERSION de server/legal.js. Es la
// única sincronización manual del diseño: el servidor decide qué versión rige,
// este texto es lo que el usuario ve.

export const LEGAL = {
  nombre: 'Chatnopolis',
  contacto: 'info@chatnopolis.com',
  actualizado: '14 de agosto de 2026',
  edadMinima: 18,
};

// Secciones: { id, heading, paragraphs?: string[], items?: (string | {title, text})[], tone?: 'danger' }
export const LEGAL_PAGES = {
  terminos: {
    slug: 'terminos',
    title: 'Términos y condiciones',
    tagline: 'Las reglas que rigen el uso de Chatnopolis. Al entrar, las aceptas.',
    sections: [
      {
        id: 'servicio',
        heading: 'Qué es este servicio',
        paragraphs: [
          `${LEGAL.nombre} es un servicio de chat en tiempo real con salas públicas y mensajes privados. Se puede entrar como invitado, eligiendo solo un nick, o con una cuenta registrada.`,
          'El servicio se ofrece tal como está, de forma gratuita y sin garantía de disponibilidad. Podemos modificarlo, suspenderlo o darlo de baja en cualquier momento, así como cambiar las salas disponibles o estas condiciones.',
          'Estos términos se aplican a todo el que accede, sin importar si tiene cuenta o no.',
        ],
      },
      {
        id: 'edad',
        heading: `Edad mínima: ${LEGAL.edadMinima} años`,
        paragraphs: [
          `El acceso está reservado a personas de ${LEGAL.edadMinima} años o más. No hay excepciones y no importa que un adulto acompañe o autorice: si eres menor de ${LEGAL.edadMinima}, no puedes usar este servicio.`,
          'Al entrar declaras, bajo tu responsabilidad, que tienes la edad mínima. Esa declaración se te pide de forma explícita y queda registrada: en las cuentas registradas guardamos la fecha en que aceptaste; en el modo invitado, la aceptación se exige en cada sesión.',
          'Si detectamos o nos informan que una cuenta pertenece a un menor de edad, la bloqueamos de inmediato y borramos sus datos. Si crees que hay un menor en el chat, escríbenos: es la denuncia que atendemos con más prioridad.',
        ],
      },
      {
        id: 'contenido-adulto',
        heading: 'Contenido para adultos',
        paragraphs: [
          'Entre personas adultas y de común acuerdo, se permite hablar de temas sexuales y compartir contenido adulto por mensaje privado. Es por eso mismo que la edad mínima no es negociable.',
          'Ese permiso tiene límites claros. El contenido sexual explícito va únicamente por privado y entre personas que lo consienten: las salas públicas no son el lugar, y el chat técnicamente solo permite enviar fotos por privado.',
          'Nadie está obligado a recibir nada. Enviar contenido sexual a quien no lo pidió, o insistir después de una negativa, es acoso y se sanciona como tal, aunque ocurra en un privado.',
        ],
      },
      {
        id: 'prohibido',
        heading: 'Prohibido siempre, sin excepción',
        tone: 'danger',
        paragraphs: [
          'Lo siguiente está prohibido para todo el mundo, en salas y en privados, sin importar el consentimiento de las partes:',
        ],
        items: [
          {
            title: 'Material de abuso sexual infantil',
            text: 'Cualquier contenido sexual que involucre a menores de edad, real o simulado, incluyendo su solicitud, su descripción o el intento de conseguirlo. Es tolerancia cero: baneo permanente, conservación de la información que exista en ese momento y denuncia a la autoridad competente.',
          },
          {
            title: 'Contacto sexual con menores',
            text: 'Intentar contactar, seducir o citar a un menor de edad, dentro o fuera de la plataforma.',
          },
          {
            title: 'Imágenes de terceros sin su consentimiento',
            text: 'Compartir fotos íntimas de otra persona sin su permiso, incluyendo las que te enviaron a ti en privado. Lo que recibes en un privado es para ti y termina ahí.',
          },
          {
            title: 'Extorsión y coerción',
            text: 'Amenazar con difundir imágenes o conversaciones, presionar para obtener contenido, o cualquier forma de chantaje sexual o económico.',
          },
          {
            title: 'Violencia real y actividad ilegal',
            text: 'Contenido que muestre violencia real, abuso de animales, o que ofrezca, promueva o coordine actividades ilegales de cualquier tipo.',
          },
          {
            title: 'Suplantación de identidad',
            text: 'Hacerse pasar por otra persona, por un moderador o por el personal del servicio.',
          },
        ],
      },
      {
        id: 'normas',
        heading: 'Normas de convivencia',
        paragraphs: [
          'Además de lo anterior, en las salas rigen unas normas básicas para que el lugar sea usable:',
        ],
        items: [
          {
            title: 'Sin agresiones ni hostigamiento',
            text: 'Nada de insultos, burlas, amenazas, difamación ni persecución de un usuario. Tampoco ataques dirigidos a un grupo por su religión, ideología, origen, género u orientación.',
          },
          {
            title: 'Sin spam ni publicidad',
            text: 'No promociones otros sitios o chats, no repitas el mismo mensaje una y otra vez, y no uses el chat para recolectar contactos con fines comerciales.',
          },
          {
            title: 'Sin datos personales de terceros',
            text: 'No publiques direcciones, teléfonos, documentos, lugares de trabajo ni fotos de otras personas. Tampoco los tuyos en salas públicas: piénsalo dos veces antes de compartirlos incluso en privado.',
          },
          {
            title: 'Un nick, una identidad',
            text: 'No elijas un nick ofensivo, ni uno que se parezca al de un usuario registrado o al de un moderador para confundir a los demás.',
          },
        ],
      },
      {
        id: 'moderacion',
        heading: 'Moderación y sanciones',
        paragraphs: [
          'Moderamos de forma activa, pero no leemos todo lo que pasa: revisamos lo que se nos reporta y lo que detectamos. Que algo no se haya sancionado no significa que esté permitido.',
          'Las sanciones disponibles son tres, y se aplican según la gravedad y la reincidencia:',
        ],
        items: [
          {
            title: 'Silenciar',
            text: 'La persona sigue en la sala pero no puede escribir ni enviar fotos hasta que se le levante.',
          },
          {
            title: 'Expulsar',
            text: 'Se cierra la conexión. Puede volver a entrar enseguida; sirve para cortar una situación en caliente.',
          },
          {
            title: 'Banear',
            text: 'Se bloquea el acceso por 10 minutos, 1 hora, 4 horas o de forma permanente.',
          },
        ],
      },
      {
        id: 'alcance-ban',
        heading: 'Hasta dónde llega un baneo',
        paragraphs: [
          'Preferimos ser claros con lo que el sistema hace y lo que no. Baneamos la identidad, no la conexión: no registramos direcciones IP para este fin.',
          'El bloqueo cubre las variantes del mismo nombre, porque los nicks se comparan sin distinguir mayúsculas, acentos ni espacios: quien fue baneado como "Maria" no vuelve como "María" ni como "M aria". Pero un invitado que elija un nick realmente distinto puede volver a entrar. Si eso pasa, repórtalo de nuevo.',
        ],
      },
      {
        id: 'fotos',
        heading: 'Fotos',
        paragraphs: [
          'Las fotos se envían únicamente por mensaje privado, pesan como máximo 5 MB y deben ser imágenes (jpg, png, gif o webp).',
          'Las fotos se borran automáticamente de nuestro servidor 24 horas después de subirse. El mensaje sobrevive, pero la imagen desaparece y en su lugar aparece "Foto vencida".',
          'Ese borrado protege el almacenamiento, no tu privacidad: quien recibió la foto pudo haberle sacado una captura o haberla descargado durante esas horas. Una vez que envías una imagen, pierdes el control sobre ella.',
        ],
      },
      {
        id: 'cuenta',
        heading: 'Tu cuenta y tu nick',
        paragraphs: [
          'Eres responsable de tu contraseña y de todo lo que ocurra desde tu cuenta. Si crees que alguien accedió a ella, cámbiala y avísanos.',
          'Los nicks de invitado no te pertenecen: se reservan solo mientras estás conectado, y cuando te vas cualquier otra persona puede tomarlo. Si quieres que tu nombre sea tuyo, registra una cuenta.',
        ],
      },
      {
        id: 'responsabilidad',
        heading: 'Responsabilidad',
        paragraphs: [
          'El contenido de las conversaciones lo generan los usuarios y es responsabilidad de quien lo escribe o lo envía. No lo verificamos previamente ni comprobamos la identidad de nadie.',
          'Usas el servicio bajo tu propia responsabilidad. No respondemos por los daños que pueda ocasionarte el contenido de otros usuarios, por las relaciones que establezcas dentro del chat ni por lo que ocurra si llevas esa relación fuera de la plataforma.',
          'Si una conversación te incomoda, puedes salir en cualquier momento y reportarla. Te recomendamos leer las recomendaciones de seguridad antes de compartir cualquier dato con un desconocido.',
        ],
      },
      {
        id: 'cambios',
        heading: 'Cambios en estos términos',
        paragraphs: [
          'Podemos modificar estos términos. Cuando lo hagamos, la fecha de arriba cambia y se te vuelve a pedir la aceptación al entrar: si tienes cuenta, en el próximo inicio de sesión; si entras como invitado, en tu próxima sesión.',
          'Seguir usando el servicio después de aceptar la nueva versión implica que estás de acuerdo con ella. Si no la aceptas, no podrás entrar.',
        ],
      },
      {
        id: 'contacto',
        heading: 'Contacto y denuncias',
        paragraphs: [
          `Para denunciar a un usuario, reportar contenido ilegal, pedir la baja de tu cuenta o hacer cualquier consulta, escribe a ${LEGAL.contacto}.`,
          'Para que podamos actuar, incluye el nick de la persona, la sala o el tipo de conversación, la fecha y la hora aproximadas y, si puedes, una captura. Ten en cuenta que las fotos se borran a las 24 horas: cuanto antes reportes, más información tendremos para revisar.',
        ],
      },
    ],
  },

  privacidad: {
    slug: 'privacidad',
    title: 'Política de privacidad',
    tagline: 'Qué datos guardamos, por cuánto tiempo y qué hacemos con ellos.',
    sections: [
      {
        id: 'resumen',
        heading: 'En pocas palabras',
        paragraphs: [
          'No vendemos datos, no usamos cookies de seguimiento, no tenemos analítica ni publicidad, y no compartimos nada con terceros.',
          'Guardamos lo mínimo para que el chat funcione, y casi todo se borra solo al poco tiempo. Abajo está el detalle exacto.',
        ],
      },
      {
        id: 'que-guardamos',
        heading: 'Qué datos guardamos',
        items: [
          {
            title: 'Si entras como invitado',
            text: 'Solo el nick que elegiste, mientras dura la sesión. No creamos ninguna cuenta ni guardamos un perfil tuyo.',
          },
          {
            title: 'Si tienes cuenta registrada',
            text: 'Tu nombre de usuario, el nombre que indicaste, tu email, tu país si lo completaste, la fecha de alta, tu estado de moderación y la fecha en que aceptaste estos términos. La contraseña nunca se guarda: se almacena un hash bcrypt, del que no se puede recuperar la original. Si la cuenta tiene activada la verificación en dos pasos, también guardamos la clave que comparte con la app de autenticación y un hash de cada código de recuperación sin usar; al desactivarla se borran.',
          },
          {
            title: 'Mensajes',
            text: 'Los mensajes de sala y los privados se guardan en la base de datos del servidor, con el nick de quien los envió, el destinatario si es privado y la fecha.',
          },
          {
            title: 'Fotos',
            text: 'Las imágenes que envías por privado se guardan como archivos en el servidor y el mensaje conserva su dirección.',
          },
        ],
      },
      {
        id: 'retencion',
        heading: 'Cuánto tiempo los guardamos',
        paragraphs: ['El borrado es automático y no hace falta que lo pidas:'],
        items: [
          {
            title: 'Mensajes de sala',
            text: 'Se conservan los últimos 500 de cada sala. Los más antiguos se borran a medida que llegan mensajes nuevos.',
          },
          {
            title: 'Mensajes privados',
            text: 'Se borran a los 90 días, y de cada conversación se conservan como máximo los últimos 500 mensajes.',
          },
          {
            title: 'Fotos',
            text: 'El archivo se borra del servidor 24 horas después de subirse. El mensaje queda, marcado como "Foto vencida".',
          },
          {
            title: 'Historial de privados con invitados',
            text: 'Nunca se entrega. Como el nick de un invitado lo puede tomar otra persona cuando se va, mostrar ese historial dejaría que la siguiente persona con ese nombre leyera conversaciones ajenas. Para invitados, el privado vive solo en la sesión abierta.',
          },
          {
            title: 'Datos de cuenta',
            text: 'Se conservan mientras la cuenta exista. Si pides la baja, se eliminan.',
          },
        ],
      },
      {
        id: 'ip',
        heading: 'Tu dirección IP',
        paragraphs: [
          'No guardamos tu dirección IP en la base de datos, ni la asociamos a tu nick, a tus mensajes ni a los baneos. Se usa solo en memoria y de forma transitoria, para limitar la cantidad de conexiones e intentos de acceso por minuto y frenar el abuso automatizado. Se descarta al poco tiempo.',
          'Lo que sí ocurre, y preferimos decirlo: el servidor web que sirve el sitio registra las IP en su archivo de accesos, como hace cualquier servidor de internet. Ese registro es técnico, no lo cruzamos con tu actividad en el chat y se rota periódicamente.',
        ],
      },
      {
        id: 'cookies',
        heading: 'Cookies y almacenamiento del navegador',
        paragraphs: [
          'No usamos cookies de seguimiento, ni publicidad, ni herramientas de analítica, ni ningún servicio de terceros que te siga.',
          'Sí usamos el almacenamiento de tu propio navegador, que no viaja a nuestro servidor: tu sesión de chat, que se borra al cerrar la pestaña; tu preferencia de tema claro u oscuro; y la confirmación de que declaraste ser mayor de edad. Puedes borrar todo eso desde tu navegador cuando quieras.',
        ],
      },
      {
        id: 'cifrado',
        heading: 'Qué tan privados son los mensajes privados',
        paragraphs: [
          'Son privados frente a los demás usuarios: nadie más los ve en el chat. Pero no tienen cifrado de extremo a extremo, y es importante que lo sepas.',
          'La conexión viaja cifrada entre tu navegador y el servidor, pero los mensajes se guardan legibles en la base de datos. Eso significa que quien administra el servidor tiene la posibilidad técnica de leerlos, y que una orden de una autoridad competente podría alcanzarlos.',
          'No los leemos como rutina ni tenemos ningún interés en hacerlo, pero no queremos que asumas una garantía que el sistema no da. Si necesitas confidencialidad real, usa una herramienta con cifrado de extremo a extremo.',
        ],
      },
      {
        id: 'terceros',
        heading: 'Con quién compartimos tus datos',
        paragraphs: [
          'Con nadie. No vendemos, cedemos ni intercambiamos información personal.',
          'Las únicas excepciones son un requerimiento de una autoridad competente por la vía que corresponda, y los casos de contenido de abuso sexual infantil, donde la denuncia es obligatoria y la haremos sin dudarlo.',
        ],
      },
      {
        id: 'derechos',
        heading: 'Tus derechos',
        paragraphs: [
          `Puedes pedir acceso a los datos que tenemos sobre ti, corregirlos si están mal, o solicitar que se borre tu cuenta junto con tus datos. Escribe a ${LEGAL.contacto} desde el email con el que te registraste, indicando tu nombre de usuario.`,
          'Ten en cuenta que los mensajes ya enviados a otras personas forman parte de la conversación de ambas, y que gran parte del contenido se borra solo por los plazos indicados más arriba.',
        ],
      },
      {
        id: 'seguridad-datos',
        heading: 'Cómo protegemos la información',
        paragraphs: [
          'Las contraseñas se guardan con hash bcrypt, las sesiones usan tokens firmados, el sitio se sirve por conexión cifrada, el acceso de administración puede protegerse con verificación en dos pasos y hay límites de frecuencia para frenar los intentos automatizados de acceso.',
          'Ningún sistema es infalible. Si detectamos un incidente que afecte tus datos, te lo comunicaremos.',
        ],
      },
      {
        id: 'menores',
        heading: 'Menores de edad',
        paragraphs: [
          `Este servicio no está dirigido a menores de ${LEGAL.edadMinima} años y no recogemos datos de menores a sabiendas. Si detectamos una cuenta de un menor, la bloqueamos y borramos sus datos.`,
          `Si eres madre, padre o tutor y crees que un menor a tu cargo usó el servicio, escríbenos a ${LEGAL.contacto} y lo resolvemos de inmediato.`,
        ],
      },
      {
        id: 'cambios-privacidad',
        heading: 'Cambios en esta política',
        paragraphs: [
          'Podemos actualizar esta política. La fecha de arriba indica la última versión, y los cambios importantes se anuncian junto con los términos, pidiéndote de nuevo la aceptación.',
        ],
      },
    ],
  },

  seguridad: {
    slug: 'seguridad',
    title: 'Recomendaciones de seguridad',
    tagline: 'Consejos prácticos para que tu paso por el chat sea seguro.',
    sections: [
      {
        id: 'intro',
        heading: 'Antes de empezar',
        paragraphs: [
          'La mayoría de la gente entra a conversar y nada más. Pero en cualquier chat abierto hay quien busca aprovecharse, y unas pocas costumbres te evitan casi todos los problemas.',
          'Ninguna de estas recomendaciones es una obligación: son lo que la experiencia enseña.',
        ],
      },
      {
        id: 'ofertas',
        heading: 'Desconfía de lo que llega sin que lo pidas',
        paragraphs: [
          'Si alguien te escribe por privado sin conversación previa y te invita a otra red, te pasa un número de teléfono o te ofrece dinero, trabajo o fotos, la probabilidad de que sea una estafa es alta.',
          'El apuro es la señal más clara. Quien tiene intenciones honestas no necesita que decidas en dos minutos.',
        ],
      },
      {
        id: 'identidad',
        heading: 'Nadie es necesariamente quien dice ser',
        paragraphs: [
          'No verificamos la identidad de nadie. La edad, el género, la foto y la historia de vida de la persona con la que hablas son afirmaciones suyas, no datos comprobados.',
          'Esto vale también al revés: si alguien te pide que demuestres quién eres enviando documentos o fotos, no lo hagas.',
        ],
      },
      {
        id: 'enlaces',
        heading: 'Cuidado con los enlaces',
        paragraphs: [
          'No abras enlaces que te manden desconocidos, por más que parezcan de un sitio conocido. Es la forma más común de robar contraseñas y de instalar programas maliciosos.',
          'Tampoco descargues archivos que te ofrezcan por privado.',
        ],
      },
      {
        id: 'datos',
        heading: 'Protege tus datos personales',
        paragraphs: [
          'No compartas tu dirección, tu teléfono, tu lugar de trabajo o estudio, tu documento ni datos bancarios. Tampoco los publiques en las salas, donde los ve todo el mundo.',
          'Usa una contraseña distinta de la de tu email y tus redes. Si esta se filtrara, no quieres que abra otras puertas.',
        ],
      },
      {
        id: 'fotos',
        heading: 'Antes de enviar una foto, piénsalo',
        paragraphs: [
          'Nuestro servidor borra las fotos a las 24 horas, pero eso no significa que desaparezcan: la persona que la recibió pudo haberle sacado una captura o haberla guardado en ese tiempo.',
          'Una vez que envías una imagen, pierdes el control sobre ella. Vale especialmente para las fotos íntimas y para cualquier imagen donde se te reconozca o se vea dónde vives.',
          'Si alguien te amenaza con difundir imágenes tuyas, no le pagues ni le sigas el juego: guarda las capturas, repórtalo y, si puedes, denúncialo a la policía. Es un delito y no es tu culpa.',
        ],
      },
      {
        id: 'terceros',
        heading: 'Los datos de otras personas también importan',
        paragraphs: [
          'No compartas fotos, mensajes ni información de terceros sin su permiso, ni siquiera en privado. Lo que alguien te envió a ti te lo envió a ti.',
        ],
      },
      {
        id: 'invitados',
        heading: 'Si entras como invitado',
        paragraphs: [
          'Tu nick es tuyo solo mientras estás conectado. Al salir, otra persona puede tomarlo, y por eso el historial de tus privados no se te muestra al volver: sería la conversación de quien tuvo ese nombre antes.',
          'Si quieres que tu nombre sea tuyo y conservar tus conversaciones, registra una cuenta.',
        ],
      },
      {
        id: 'reportar',
        heading: 'Reporta lo que no está bien',
        paragraphs: [
          `Si ves contenido ilegal, acoso, o cualquier indicio de que hay un menor de edad en el chat, escríbenos a ${LEGAL.contacto} con el nick, la sala, la fecha y la hora aproximadas y una captura si la tienes.`,
          'Reportar temprano importa: las fotos se borran solas a las 24 horas, así que cuanto antes avises, más información habrá para revisar.',
        ],
      },
      {
        id: 'moderadores',
        heading: 'Sobre los moderadores',
        paragraphs: [
          'Los moderadores están para que el lugar funcione. Respeta sus decisiones y no los satures con mensajes insistentes: atender un reporte lleva su tiempo.',
          'Ningún moderador te va a pedir tu contraseña, ni fotos, ni datos personales. Si alguien lo hace diciendo que es del staff, es un impostor: repórtalo.',
        ],
      },
    ],
  },
};

// Orden de los links en el pie de página.
export const LEGAL_LINKS = [
  { to: '/terminos', label: 'Términos' },
  { to: '/privacidad', label: 'Privacidad' },
  { to: '/seguridad', label: 'Seguridad' },
];
