export type OwnershipDiagramLabels = {
  environment: string;
  members: string;
  administrators: string;
  web: string;
  api: string;
  postgresql: string;
  worker: string;
  redis: string;
  uploads: string;
  smtpProvider: string;
  diagramTitle: string;
  diagramDescription: string;
  unavailable: string;
};

export type NotificationDiagramLabels = {
  communityAction: string;
  notificationCreated: string;
  queue: string;
  worker: string;
  inApp: string;
  emailProvider: string;
  deliveryStatus: string;
  optionalEmail: string;
  diagramTitle: string;
  diagramDescription: string;
  unavailable: string;
};

export type MarketingDiagramOrientation = 'landscape' | 'portrait';

export function createOwnershipDiagramSource(
  labels: OwnershipDiagramLabels,
  orientation: MarketingDiagramOrientation = 'landscape',
) {
  const direction = orientation === 'portrait' ? 'TB' : 'LR';

  return `flowchart ${direction}
  accTitle: ${labels.diagramTitle}
  accDescr: ${labels.diagramDescription}
  People["${labels.members} + ${labels.administrators}"]
  subgraph Environment["${labels.environment}"]
    direction ${direction}
    Web["${labels.web}"] webToApi@--> API["${labels.api}"]
    API --> Database[("${labels.postgresql}")]
    API --> Uploads[("${labels.uploads}")]
    API enqueueJob@--> Redis[("${labels.redis}")]
    Redis queueToWorker@--> Worker["${labels.worker}"]
  end
  Provider["${labels.smtpProvider}"]
  People requestToWeb@--> Web
  Worker deliverEmail@--> Provider
  requestToWeb@{ animation: slow }
  webToApi@{ animation: fast }
  enqueueJob@{ animation: fast }
  queueToWorker@{ animation: fast }
  deliverEmail@{ animation: fast }`;
}

export function createNotificationDiagramSource(
  labels: NotificationDiagramLabels,
  orientation: MarketingDiagramOrientation = 'landscape',
) {
  const direction = orientation === 'portrait' ? 'TB' : 'LR';

  return `flowchart ${direction}
  accTitle: ${labels.diagramTitle}
  accDescr: ${labels.diagramDescription}
  Action["${labels.communityAction}"] evaluateAction@--> Created["${labels.notificationCreated}"]
  Created inAppDelivery@--> InApp["${labels.inApp}"]
  InApp --> Status["${labels.deliveryStatus}"]
  Created enqueueEmail@-.->|${labels.optionalEmail}| Queue[("${labels.queue}")]
  Queue workerHandoff@--> Worker["${labels.worker}"]
  Worker emailDelivery@--> Provider["${labels.emailProvider}"]
  Provider --> Status
  evaluateAction@{ animation: slow }
  inAppDelivery@{ animation: fast }
  enqueueEmail@{ animation: fast }
  workerHandoff@{ animation: fast }
  emailDelivery@{ animation: fast }`;
}
