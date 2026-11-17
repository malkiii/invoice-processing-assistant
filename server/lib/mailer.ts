import nodemailer from 'nodemailer'
import type { SmtpConfig } from './config'

export interface Mail {
  to: string
  subject: string
  text: string
}

export interface Mailer {
  send(mail: Mail): Promise<void>
}

export function createSmtpMailer(smtp: SmtpConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
  })
  return {
    async send(mail) {
      await transport.sendMail({ from: smtp.from, ...mail })
    },
  }
}
