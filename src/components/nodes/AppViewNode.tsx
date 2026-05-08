import type { NodeProps } from "@xyflow/react";
import { useDiagramContext } from "../../app/diagramContext";
import {
  getAppViewEventEndpoint,
  getAppViewInputEndpoint,
  getAppViewOnLoadEndpoint,
  parseAppViewEventSourceHandleId,
  isAppViewOnLoadSourceHandleId,
} from "../../domain/connectionEndpoints";
import { createAppViewEvent } from "../../domain/model";
import type { AppViewData, AppViewEvent, EssaNode } from "../../domain/types";
import { BlockTextareaInput } from "../blockEditors/BlockTextareaInput";
import { TrashButton } from "../blockEditors/TrashButton";
import { BlockNodeFrame } from "./BlockNodeFrame";
import {
  ConnectionHandle,
  getConnectionInteractionClass,
  getConnectionUiState,
} from "./ConnectionHandle";

type AppViewNodeProps = NodeProps<EssaNode> & {
  data: AppViewData;
};

const updateEvent = (
  events: AppViewEvent[],
  eventId: string,
  patch: Partial<AppViewEvent>,
) =>
  events.map((event) =>
    event.id === eventId ? { ...event, ...patch } : event,
  );

const EVENT_NAME_SEPARATOR = "::";

const parseEventName = (name: string) => {
  const separatorIndex = name.indexOf(EVENT_NAME_SEPARATOR);

  if (separatorIndex === -1) {
    return { component: name, action: "" };
  }

  return {
    component: name.slice(0, separatorIndex),
    action: name.slice(separatorIndex + EVENT_NAME_SEPARATOR.length),
  };
};

const formatEventName = (component: string, action: string) =>
  `${component}${EVENT_NAME_SEPARATOR}${action}`;

const eventNameInputWidth = (value: string, placeholder: string, min = 10) =>
  `${Math.max(min, value.length || placeholder.length, 1) + 1}ch`;

export const AppViewNode = ({ id, data, selected }: AppViewNodeProps) => {
  const ctx = useDiagramContext();
  const connectionState = getConnectionUiState(data);
  const inputEndpoint = getAppViewInputEndpoint(id);
  const onLoadEndpoint = getAppViewOnLoadEndpoint(id);
  const linkedOnLoad = ctx.edges.some(
    (edge) =>
      edge.source === id && isAppViewOnLoadSourceHandleId(edge.sourceHandle),
  );
  const linkedEventIds = new Set(
    ctx.edges.flatMap((edge) => {
      if (edge.source !== id) {
        return [];
      }

      const eventId = parseAppViewEventSourceHandleId(edge.sourceHandle);
      return eventId ? [eventId] : [];
    }),
  );

  return (
    <BlockNodeFrame
      id={id}
      selected={selected}
      badge="App view"
      variant="view"
      title={data.viewName}
      titlePlaceholder="App view"
      titleAriaLabel="View name"
      deleteAriaLabel="Delete app view"
      onTitleChange={(next) => ctx.onUpdateNodeData(id, { viewName: next })}
    >
      <ConnectionHandle endpoint={inputEndpoint} state={connectionState} />
      <input
        aria-label="View route"
        className="block-node__route-input nodrag nowheel"
        placeholder="/route"
        value={data.route}
        onChange={(event) =>
          ctx.onUpdateNodeData(id, { route: event.target.value })
        }
      />

      <BlockTextareaInput
        nodeId={id}
        aria-label="View description"
        className="block-node__description-input nodrag nowheel"
        placeholder="Context"
        rows={2}
        committedValue={data.description ?? ""}
        onCommit={(next) => ctx.onUpdateNodeData(id, { description: next })}
      />

      <section className="block-node__section">
        <h4 className="block-node__section-title">Lifecycle</h4>
        <div
          className={`field-row app-view-event-row ${getConnectionInteractionClass(
            onLoadEndpoint,
            connectionState,
          )}${linkedOnLoad ? " field-row--linked" : ""}`}
        >
          <span className="field-row__name">onLoad</span>
          <span className="field-row__type">fetch</span>
          <ConnectionHandle endpoint={onLoadEndpoint} state={connectionState} />
        </div>
      </section>

      <section className="block-node__section">
        <h4 className="block-node__section-title">Events</h4>

        {data.events.length === 0 ? (
          <p className="block-node__empty">
            Add named events like onClick::Submit or onSubmit::Login.
          </p>
        ) : null}

        {data.events.map((event) => {
          const isLinked = linkedEventIds.has(event.id);
          const eventEndpoint = getAppViewEventEndpoint(id, event);
          const eventName = parseEventName(event.name);

          return (
            <div
              key={event.id}
              className={`app-view-event-row app-view-event-row--editable ${getConnectionInteractionClass(
                eventEndpoint,
                connectionState,
              )}${isLinked ? " field-row--linked" : ""}`}
            >
              <div className="app-view-event-row__body">
                <div className="app-view-event-row__name-fields">
                  <input
                    aria-label="Event component"
                    className="app-view-event-row__input nodrag nowheel"
                    placeholder="Component"
                    style={{
                      width: eventNameInputWidth(
                        eventName.component,
                        "Component",
                      ),
                    }}
                    value={eventName.component}
                    onChange={(inputEvent) =>
                      ctx.onUpdateNodeData(id, {
                        events: updateEvent(data.events, event.id, {
                          name: formatEventName(
                            inputEvent.target.value,
                            eventName.action,
                          ),
                        }),
                      })
                    }
                  />
                  <span className="app-view-event-row__separator">
                    {EVENT_NAME_SEPARATOR}
                  </span>
                  <input
                    aria-label="Event action"
                    className="app-view-event-row__input nodrag nowheel"
                    placeholder="Action"
                    style={{
                      width: eventNameInputWidth(eventName.action, "Action", 8),
                    }}
                    value={eventName.action}
                    onChange={(inputEvent) =>
                      ctx.onUpdateNodeData(id, {
                        events: updateEvent(data.events, event.id, {
                          name: formatEventName(
                            eventName.component,
                            inputEvent.target.value,
                          ),
                        }),
                      })
                    }
                  />
                </div>
                <textarea
                  aria-label="Event description"
                  className="app-view-event-row__description nodrag nowheel"
                  placeholder="Context"
                  rows={1}
                  value={event.description ?? ""}
                  onChange={(inputEvent) =>
                    ctx.onUpdateNodeData(id, {
                      events: updateEvent(data.events, event.id, {
                        description: inputEvent.target.value,
                      }),
                    })
                  }
                />
              </div>
              <TrashButton
                ariaLabel="Delete event"
                onClick={() =>
                  ctx.onUpdateNodeData(id, {
                    events: data.events.filter((item) => item.id !== event.id),
                  })
                }
              />
              <ConnectionHandle
                endpoint={eventEndpoint}
                state={connectionState}
              />
            </div>
          );
        })}

        <button
          type="button"
          className="field-row field-row--button nodrag"
          onClick={() => {
            const nextEvent = createAppViewEvent();
            ctx.onUpdateNodeData(id, { events: [...data.events, nextEvent] });
          }}
        >
          + Add event
        </button>
      </section>
    </BlockNodeFrame>
  );
};
