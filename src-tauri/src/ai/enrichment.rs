use serde_json::{json, Value};

#[allow(unused_imports)]
use super::*;

pub(crate) fn resolve_enrichment_jobs_compartment_id(
    store: &AiOracleStructuredStoreRegistration,
    compartment_id_override: Option<&str>,
) -> Result<String, String> {
    let compartment_id = first_non_empty(&[
        compartment_id_override.unwrap_or(""),
        store.compartment_id.as_str(),
        // Legacy configs briefly stored this value in storeOcid before the UI exposed
        // the Oracle API's compartmentId requirement explicitly.
        store.store_ocid.as_str(),
    ]);
    if compartment_id.is_empty() {
        return Err("Compartment OCID is required to refresh enrichment jobs".to_string());
    }
    Ok(compartment_id)
}

pub(crate) fn build_enrichment_job_payload(
    store: &AiOracleStructuredStoreRegistration,
    request: &AiEnrichmentJobRequest,
) -> Result<Value, String> {
    let mode = match request.mode.trim() {
        "partial" => "PARTIAL_BUILD",
        "delta" => {
            return Err(
                "Delta enrichment requires a refresh schedule and is not supported by this setup panel yet. Use Full Build or Partial Build."
                    .to_string(),
            )
        }
        _ => "FULL_BUILD",
    };
    let schema_name = first_non_empty(&[request.schema_name.as_str(), store.schema_name.as_str()]);
    if schema_name.is_empty() {
        return Err("Schema name is required for enrichment jobs".to_string());
    }
    let mut configuration = json!({
        "enrichmentJobType": mode,
        "schemaName": schema_name,
    });
    if mode == "PARTIAL_BUILD" {
        let objects = if request.database_objects.is_empty() {
            store
                .enrichment_object_names
                .lines()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(build_database_object_payload)
                .collect::<Vec<_>>()
        } else {
            request
                .database_objects
                .iter()
                .map(|name| name.trim())
                .filter(|value| !value.is_empty())
                .map(build_database_object_payload)
                .collect::<Vec<_>>()
        };
        if objects.is_empty() {
            return Err("Partial enrichment requires at least one database object".to_string());
        }
        configuration["databaseObjects"] = Value::Array(objects);
    }
    Ok(json!({
        "enrichmentJobType": mode,
        "enrichmentJobConfiguration": configuration
    }))
}

pub(crate) fn build_database_object_payload(name: &str) -> Value {
    json!({
        "name": name,
        "type": "TABLE"
    })
}
