//creare de resurse folosind clientul

package workspace

import (
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
)

// CREATEWORKSPACEREQUEST
// USERID SI WORKSPACEID. GESTIOMATE DE BACKEND TYPESCRIPT
func BuildDeployment(req CreateWorkspaceRequest) *appsv1.Deployment {
	replicas := int32(1)

	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:   req.WorkspaceID,
			Labels: workspaceLabels(req),
		},

		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,

			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"workspace-id": req.WorkspaceID,
				},
			},

			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: workspaceLabels(req),
				},

				Spec: corev1.PodSpec{
					// The runtime's "sleep infinity" ignores SIGTERM; don't wait
					// the default 30 s for it when the workspace stops.
					TerminationGracePeriodSeconds: int64Ptr(5),

					// User code runs here: no Kubernetes API token in the pod.
					AutomountServiceAccountToken: boolPtr(false),
					// Skip the env vars Kubernetes adds for every Service in the
					// namespace; each workspace adds a Service, so they keep growing.
					EnableServiceLinks: boolPtr(false),

					SecurityContext: &corev1.PodSecurityContext{
						FSGroup:             int64Ptr(1000),
						FSGroupChangePolicy: fsGroupChangePolicyPtr(corev1.FSGroupChangeOnRootMismatch),
					},

					Volumes: []corev1.Volume{
						{
							Name: "workspace",
							VolumeSource: corev1.VolumeSource{
								PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{
									ClaimName: pvcName(req.WorkspaceID),
								},
							},
						},
					},

					Containers: []corev1.Container{
						{
							Name:            "workspace-runtime",
							Image:           workspaceRuntimeImage(),
							ImagePullPolicy: corev1.PullNever,

							SecurityContext: &corev1.SecurityContext{
								RunAsUser:    int64Ptr(1000),
								RunAsGroup:   int64Ptr(1000),
								RunAsNonRoot: boolPtr(true),
							},

							VolumeMounts: []corev1.VolumeMount{
								{
									Name:      "workspace",
									MountPath: "/workspace",
								},
							},
						},

						{
							Name:            "file-agent",
							Image:           fileAgentImage(),
							ImagePullPolicy: corev1.PullNever,

							SecurityContext: &corev1.SecurityContext{
								RunAsUser:    int64Ptr(1000),
								RunAsGroup:   int64Ptr(1000),
								RunAsNonRoot: boolPtr(true),
							},

							VolumeMounts: []corev1.VolumeMount{
								{
									Name:      "workspace",
									MountPath: "/workspace",
								},
							},
						},
					},
				},
			},
		},
	}
}

// Labels for everything a workspace consists of. A new map each time, so
// callers can't change each other's.
func workspaceLabels(req CreateWorkspaceRequest) map[string]string {
	return map[string]string{
		"app.kubernetes.io/managed-by": "workspace-manager",
		"workspace-id":                 req.WorkspaceID,
		"user-id":                      req.UserID,
	}
}

func pvcName(workspaceID string) string {
	return workspaceID + "-pvc"
}

func int64Ptr(v int64) *int64 {
	return &v
}

func boolPtr(v bool) *bool {
	return &v
}

func fsGroupChangePolicyPtr(v corev1.PodFSGroupChangePolicy) *corev1.PodFSGroupChangePolicy {
	return &v
}

func BuildPVC(req CreateWorkspaceRequest) *corev1.PersistentVolumeClaim {
	return &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{
			Name:   pvcName(req.WorkspaceID),
			Labels: workspaceLabels(req),
		},

		Spec: corev1.PersistentVolumeClaimSpec{
			AccessModes: []corev1.PersistentVolumeAccessMode{
				corev1.ReadWriteOnce,
			},

			Resources: corev1.VolumeResourceRequirements{
				Requests: corev1.ResourceList{
					corev1.ResourceStorage: resource.MustParse("15Gi"),
				},
			},
		},
	}
}

func BuildService(req CreateWorkspaceRequest) *corev1.Service {
	return &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:   req.WorkspaceID,
			Labels: workspaceLabels(req),
		},

		Spec: corev1.ServiceSpec{
			Type: corev1.ServiceTypeClusterIP,

			Selector: map[string]string{
				"workspace-id": req.WorkspaceID,
			},

			Ports: []corev1.ServicePort{
				{
					Name:       "file-agent",
					Port:       8081,
					TargetPort: intstr.FromInt32(8081),
					Protocol:   corev1.ProtocolTCP,
				},
			},
		},
	}
}
