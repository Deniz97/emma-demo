export type ToolArgument = {
  name: string;
  type: string;
  description: string;
};

export type Method = {
  id: string;
  classId: string;
  name: string;
  path: string;
  httpVerb: string;
  description: string | null;
  arguments: ToolArgument[];
  returnType: string | null;
  returnDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Class = {
  id: string;
  appId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  methods?: Method[];
};

export type App = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  classes?: Class[];
};
