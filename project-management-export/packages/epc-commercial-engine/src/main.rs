use std::io::{self, Read};
use std::path::PathBuf;

use epc_commercial_engine::data_overrides::PaymentDataPatch;
use epc_commercial_engine::engine::{
    apply_payment_data_overrides, append_payment_data_patch, export_error_audit,
    propagate_pm_data_after_edit, run_ipc_alignment, run_workspace_boq_format_workflow,
    run_workspace_ipc_workflow, run_workspace_payment_workflow, run_workspace_shipping_ci_workflow,
    commit_shipping_ci_ledger,
};
use epc_commercial_engine::license::{get_machine_id, sign_license_payload, LicensePayload};
use epc_commercial_engine::types::{
    AppendPaymentDataPatchRequest, ApplyPaymentDataOverridesRequest, CommitShippingCiLedgerRequest,
    ExportErrorAuditRequest,
    IpcAlignmentRequest, IpcAlignmentResponse, PropagatePmDataAfterEditRequest, SimpleOkResponse,
    WorkspaceBoqFormatWorkflowRequest, WorkspaceIpcWorkflowRequest, WorkspacePaymentWorkflowRequest,
    WorkspaceShippingCiWorkflowRequest,
};

#[derive(serde::Deserialize)]
#[serde(tag = "command", rename_all = "kebab-case")]
enum CliCommand {
    GetMachineId,
    SignLicense {
        machine_id: String,
        expires_at: i64,
        output: String,
    },
    ExecuteIpcAlignment { request: IpcAlignmentRequest },
    ExecuteWorkspaceIpcWorkflow { request: WorkspaceIpcWorkflowRequest },
    ExecuteWorkspaceBoqFormatWorkflow {
        request: WorkspaceBoqFormatWorkflowRequest,
    },
    ExecuteWorkspacePaymentWorkflow {
        request: WorkspacePaymentWorkflowRequest,
    },
    ExecuteWorkspaceShippingCiWorkflow {
        request: WorkspaceShippingCiWorkflowRequest,
    },
    CommitShippingCiLedger {
        request: CommitShippingCiLedgerRequest,
    },
    ExportErrorAudit { request: ExportErrorAuditRequest },
    AppendPaymentDataPatch {
        request: AppendPaymentDataPatchRequest,
    },
    ApplyPaymentDataOverrides {
        request: ApplyPaymentDataOverridesRequest,
    },
    PropagatePmDataAfterEdit {
        request: PropagatePmDataAfterEditRequest,
    },
}

fn main() {
    if let Err(err) = run() {
        let resp = IpcAlignmentResponse {
            ok: false,
            report: None,
            error_code: Some(epc_commercial_engine::types::ErrorCode::InternalError),
            error_message: Some(err.to_string()),
        };
        println!("{}", serde_json::to_string(&resp).unwrap_or_default());
        std::process::exit(1);
    }
}

fn run() -> anyhow::Result<()> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;
    let cmd: CliCommand = serde_json::from_str(&input)?;

    match cmd {
        CliCommand::GetMachineId => {
            println!(
                "{}",
                serde_json::json!({ "machineId": get_machine_id() })
            );
        }
        CliCommand::SignLicense {
            machine_id,
            expires_at,
            output,
        } => {
            let payload = LicensePayload {
                machine_id,
                expires_at,
            };
            let content = sign_license_payload(&payload).map_err(|e| anyhow::anyhow!(e))?;
            std::fs::write(&output, content)?;
            println!("{}", serde_json::json!({ "ok": true, "output": output }));
        }
        CliCommand::ExecuteIpcAlignment { request } => {
            let resp = run_ipc_alignment(&request);
            println!("{}", serde_json::to_string(&resp)?);
            if !resp.ok {
                std::process::exit(2);
            }
        }
        CliCommand::ExecuteWorkspaceIpcWorkflow { request } => {
            let resp = run_workspace_ipc_workflow(&request);
            println!("{}", serde_json::to_string(&resp)?);
            if !resp.ok {
                std::process::exit(2);
            }
        }
        CliCommand::ExecuteWorkspaceBoqFormatWorkflow { request } => {
            let resp = run_workspace_boq_format_workflow(&request);
            println!("{}", serde_json::to_string(&resp)?);
            if !resp.ok {
                std::process::exit(2);
            }
        }
        CliCommand::ExecuteWorkspacePaymentWorkflow { request } => {
            let resp = run_workspace_payment_workflow(&request);
            println!("{}", serde_json::to_string(&resp)?);
            if !resp.ok {
                std::process::exit(2);
            }
        }
        CliCommand::ExecuteWorkspaceShippingCiWorkflow { request } => {
            let resp = run_workspace_shipping_ci_workflow(&request);
            println!("{}", serde_json::to_string(&resp)?);
            if !resp.ok {
                std::process::exit(2);
            }
        }
        CliCommand::CommitShippingCiLedger { request } => {
            let resp = commit_shipping_ci_ledger(&request);
            println!("{}", serde_json::to_string(&resp)?);
            if !resp.ok {
                std::process::exit(2);
            }
        }
        CliCommand::ExportErrorAudit { request } => {
            let resp = export_error_audit(&request);
            println!("{}", serde_json::to_string(&resp)?);
            if !resp.ok {
                std::process::exit(3);
            }
        }
        CliCommand::AppendPaymentDataPatch { request } => {
            let patch = payment_patch_from_dto(request.patch);
            match append_payment_data_patch(&request.workspace_root, patch) {
                Ok(()) => println!("{}", serde_json::to_string(&SimpleOkResponse { ok: true, error_message: None })?),
                Err(err) => {
                    println!(
                        "{}",
                        serde_json::to_string(&SimpleOkResponse {
                            ok: false,
                            error_message: Some(err.to_string()),
                        })?
                    );
                    std::process::exit(2);
                }
            }
        }
        CliCommand::ApplyPaymentDataOverrides { request } => {
            match apply_payment_data_overrides(&request.workspace_root) {
                Ok(()) => println!("{}", serde_json::to_string(&SimpleOkResponse { ok: true, error_message: None })?),
                Err(err) => {
                    println!(
                        "{}",
                        serde_json::to_string(&SimpleOkResponse {
                            ok: false,
                            error_message: Some(err.to_string()),
                        })?
                    );
                    std::process::exit(2);
                }
            }
        }
        CliCommand::PropagatePmDataAfterEdit { request } => {
            let resp = propagate_pm_data_after_edit(
                &request.workspace_root,
                &request.edited_file_path,
            )?;
            println!("{}", serde_json::to_string(&resp)?);
            if !resp.ok {
                std::process::exit(2);
            }
        }
    }
    Ok(())
}

fn payment_patch_from_dto(dto: epc_commercial_engine::types::PaymentDataPatchDto) -> PaymentDataPatch {
    use epc_commercial_engine::data_overrides::PaymentRowMatch;
    PaymentDataPatch {
        match_keys: PaymentRowMatch {
            project_id: dto.match_keys.project_id,
            substation_lot: dto.match_keys.substation_lot,
            schedule: dto.match_keys.schedule,
            ipc_no: dto.match_keys.ipc_no,
        },
        row_key: dto.row_key,
        values: dto.values,
        lock: dto.lock,
        source: dto.source,
        note: dto.note,
        at: None,
    }
}
