import Editor, { type EditorProps, type OnMount } from "@monaco-editor/react";
import { useRef } from "react";

interface Props extends Omit<EditorProps, "onMount"> {
  variables: Record<string, string>;
  onInsertProcessVariable?: (selectedText: string) => void;
}

export function VariableEditor({
  variables,
  onInsertProcessVariable,
  ...props
}: Props) {
  const variablesRef = useRef(variables);
  variablesRef.current = variables;

  const onMount: OnMount = (editor, monaco) => {
    const disposable = monaco.languages.registerCompletionItemProvider(
      props.language ?? "plaintext",
      {
        triggerCharacters: ["{"],
        provideCompletionItems: (model, position) => {
          const line = model
            .getLineContent(position.lineNumber)
            .slice(0, position.column - 1);
          const match = line.match(/\{\{([^{}]*)$/);
          if (!match) return { suggestions: [] };
          const query = match[1].toLowerCase();
          const startColumn = position.column - match[0].length;
          const range = new monaco.Range(
            position.lineNumber,
            startColumn,
            position.lineNumber,
            position.column,
          );
          const suggestions = Object.keys(variablesRef.current)
            .filter((key) => key.toLowerCase().includes(query))
            .map((key) => ({
              label: `{{${key}}}`,
              kind: monaco.languages.CompletionItemKind.Variable,
              insertText: `{{${key}}}`,
              detail: variablesRef.current[key],
              range,
            }));
          return { suggestions };
        },
      },
    );
    const processVariableAction = onInsertProcessVariable
      ? editor.addAction({
          id: "api-forge-insert-process-variable",
          label: "插入过程变量",
          contextMenuGroupId: "api-forge-process-variable",
          contextMenuOrder: 1,
          run: (currentEditor) => {
            const selection = currentEditor.getSelection();
            if (!selection) return;
            onInsertProcessVariable(
              currentEditor.getModel()?.getValueInRange(selection) ?? "",
            );
          },
        })
      : undefined;
    editor.onDidDispose(() => {
      disposable.dispose();
      processVariableAction?.dispose();
    });
  };

  return <Editor {...props} onMount={onMount} />;
}
