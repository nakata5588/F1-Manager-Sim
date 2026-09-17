# Team Label Presentation

Stable team IDs such as `t_0001` are internal identity keys and must not be used as player-facing labels when a resolved team name exists.

The playtest Career Shell now builds a presentation label map from the opening setup plus current Save World constructor standings. Current Save World names override opening database names.

The resolver only changes rendered text nodes. It does not rewrite action IDs, data attributes, Save World state or simulation relationships.

Elements that intentionally need to display a raw identity key for developer diagnostics may opt out with `data-show-entity-id`.
