export namespace Utils {
  export type WithDelimiters<T, K extends keyof T & string> = T & {
    /**
     * The string used for joining elements when multiple values are provided for an attribute
     * @default ","
     */
    [k in K as `${k}-delimiter`]: string;
  };
}

export namespace Common {
  export type Attributes = {
    /**
     * Explicitly identify a block as a Parkdown target.
     */
    parkdown?: true;
  };
}

export namespace Template {
  export type Attributes = Common.Attributes & {
    /**
     * Regex or glob pattern to match against the name of the retrieved file(s) when populating the target.
     */
    ["name-match"]?: string;
    /**
     * Regex or glob pattern to match against the absolute path of the retrieved file(s) when populating the target.
     */
    ["path-match"]?: string;
    /**
     * Regex to match against the content of the retrieved file(s) when populating the target.
     */
    ["content-match"]?: string;
    /**
     * The string to use for opening a template block when populating the target.
     * @default "{"
     */
    open?: string;
    /**
     * The string to use for closing a template block when populating the target.
     * @default "}"
     */
    close?: string;
    /**
     * Whether to hault the template processing of a matching file
     * (e.g. to ensure this template is the last to be applied to a matching file).
     * @default false
     */
    break?: boolean;
    /**
     * The string to use for joining the processing directives of a template variable within a templated section
     * @default "|"
     */
    pipe?: string;
  };

  export type Variables = {
    "query-index": number;
    "processing-index": number;
    name: string;
    absolute: string;
    relative: string;
    created: string;
    modified: string;
    accessed: string;
    metadata: Record<string, any>;
  };

  export namespace ProcessingDirective {
    type DateFormat = "YYYY-MM-DDTHH:mm:ss.SSSZ" | "DD/MM/YY"; // more to come later
    type StringManipulation = "strip"; // more to come later
    type DefaultValue = `"${string}"`; // more to come later

    export type Any = DateFormat | StringManipulation | DefaultValue;
  }
}

export namespace Target {
  export type Attributes = Utils.WithDelimiters<
    Common.Attributes & {
      /**
       * Path or glob pattern to the source file(s) to be used to populate the target.
       */
      src: string;
      /**
       * How to sort the retrieved file(s) before populating the target.
       * @default "path"
       */
      sort?:
      | "created"
      | "modified"
      | "accessed"
      | "name"
      | "path"
      | "extension"
      | "given";
      /**
       * Whether to sort in ascending or descending order when retrieving file(s).
       * @default "asc"
       */
      order?: "asc" | "desc";
      /**
       * Limit the number of retrieved file(s).
       * 
       * Fractional values can be used to receive a subset of the retrieved file(s) (e.g. `0.5` to receive half of the retrieved file(s)).
       */
      limit?: number;
      /**
       * Skip a number of retrieved file(s) before populating the target.
       * 
       * Fractional values can be used to skip a subset of the retrieved file(s) (e.g. `0.5` to skip half of the retrieved file(s)).
       */
      offset?: number;
      /**
       * How to process the retrieved file(s) when populating the target.
       * @default "fifo"
       */
      processing?: "fifo" | "filo";
      /**
       * Template(s) to use for populating the target.
       */
      template?: string;
      /**
       * Allow 'extending' the attributes of a previously defined target(s) or template(s).
       * The value should be the id(s) of the element(s) to extend.
       */
      extend?: string;
    },
    "template" | "src" | "extend"
  >;
}
