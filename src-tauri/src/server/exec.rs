use std::future::Future;

use serde_json::Value;
use tokio::sync::oneshot;

pub const CANCELED: &str = "__REMOTE_CANCELED__";

pub type Outcome = Result<Value, String>;

pub fn run<F>(future: F, canceled: oneshot::Receiver<()>) -> Outcome
where
    F: Future<Output = Outcome>,
{
    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => return Err(format!("Blocking-Executor nicht verfügbar: {error}")),
    };
    runtime.block_on(async move {
        tokio::select! {
            result = future => result,
            _ = canceled => Err(CANCELED.to_string()),
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::{Duration, Instant};

    #[tokio::test]
    async fn synchronous_work_runs_off_the_calling_runtime() {
        let (_keep, canceled) = oneshot::channel();
        let task = tokio::task::spawn_blocking(move || {
            run(
                async {
                    std::thread::sleep(Duration::from_millis(300));
                    tokio::time::sleep(Duration::from_millis(20)).await;
                    Ok(json!("done"))
                },
                canceled,
            )
        });
        let started = Instant::now();
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert!(
            started.elapsed() < Duration::from_millis(200),
            "the calling runtime kept ticking"
        );
        assert_eq!(task.await.unwrap(), Ok(json!("done")));
    }

    #[tokio::test]
    async fn a_cancel_signal_ends_the_future_at_its_next_await() {
        let (cancel, canceled) = oneshot::channel();
        let task = tokio::task::spawn_blocking(move || {
            run(
                async {
                    tokio::time::sleep(Duration::from_secs(30)).await;
                    Ok(json!("never"))
                },
                canceled,
            )
        });
        cancel.send(()).unwrap();
        assert_eq!(task.await.unwrap(), Err(CANCELED.to_string()));
    }

    #[tokio::test]
    async fn dropping_the_cancel_sender_also_ends_the_future() {
        let (cancel, canceled) = oneshot::channel();
        let task = tokio::task::spawn_blocking(move || {
            run(
                async {
                    tokio::time::sleep(Duration::from_secs(30)).await;
                    Ok(json!("never"))
                },
                canceled,
            )
        });
        drop(cancel);
        assert_eq!(task.await.unwrap(), Err(CANCELED.to_string()));
    }
}
