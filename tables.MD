game_events
- id - int4
- game_id - uuid
- victim_id - uuid
- type - text
- details - text (method of death)
- created_at - timestamptz
- voted_out -  text

games
- id - uuid
- code - text
- status - text
- created_at - timestamptz
- host_name - text
- host_id - uuid
- murderer_id - uuid
- started_at - timestamptz
- next_event_at - timestamptz
- voting_ended - bool
- result_message

votes
- id - uuid
- game_id - uuid
- voter_id - uuid
- voted_for - uuid
- created_at - timestamptz

players
- id - uuid
- game_id - uuid
- name - text
- email - text
- is_murderer - bool
- is_dead - bool
- created_at - timestamptz
- user_id - uuid
- is_host - bool
- votes - int4
- details - json
- voted_out - bool