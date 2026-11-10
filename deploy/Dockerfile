FROM node:24.19.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node server.mjs domain.mjs db.mjs storage.mjs features.mjs operations.mjs permissions.mjs quota.mjs models.mjs gallery.mjs schedule.mjs slicer.mjs printer.mjs homeassistant.mjs terms.mjs ./
COPY --chown=node:node db ./db
COPY --chown=node:node payments ./payments
COPY --chown=node:node messaging ./messaging
COPY --chown=node:node public ./public
COPY --chown=node:node scripts/bootstrap-admin.mjs scripts/provision-database.mjs scripts/check-asaas-env.mjs ./scripts/
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
